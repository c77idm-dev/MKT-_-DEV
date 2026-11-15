import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { ROTULO_SITUACAO_NOTA } from '@/modules/fiscal/dominio';
import { registrarEvento } from '@/modules/historico/eventos';
import type { TipoLote } from './dominio';
import { ErroLotes } from './erros';
import { contarUnidades, exigirPodeGerirLotes, type LoteLinha, loteEditavel, notaAtivaDoLote, obterLote } from './repositorio';
import { exigirTransicaoLote } from './transicoes-lote';

async function loteTravado(tx: DbOuTx, loteId: string): Promise<LoteLinha> {
  const lote = await obterLote(tx, loteId, { travar: true });
  if (!lote) throw new ErroLotes('Lote não encontrado.');
  return lote;
}

/** Spec §5.4: ABERTO → FECHADO, com o tipo escolhido (decisão 2). */
export async function fecharLote(db: Db, loteId: string, tipo: TipoLote, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirPodeGerirLotes(usuario);
  await db.transaction(async (tx) => {
    const lote = await loteTravado(tx, loteId);
    exigirTransicaoLote({ de: lote.status, para: 'FECHADO', ator: usuario.perfil });
    if ((await contarUnidades(tx, loteId)) === 0) throw new ErroLotes(`O lote ${lote.codigo} não tem unidades: não há o que fechar.`);
    await tx.update(lotes).set({ status: 'FECHADO', tipo, fechadoEm: agora, fechadoPor: usuario.id, atualizadoEm: agora }).where(eq(lotes.id, loteId));
    await registrarEvento(tx, {
      entidade: 'lote',
      entidadeId: loteId,
      acao: 'lote_fechado',
      de: 'ABERTO',
      para: 'FECHADO',
      usuarioId: usuario.id,
      em: agora,
      dados: { tipo },
    });
  });
}

/** Spec §5.4: FECHADO → ABERTO enquanto não existe NF de Remessa ativa. */
export async function reabrirLote(db: Db, loteId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirPodeGerirLotes(usuario);
  await db.transaction(async (tx) => {
    const lote = await loteTravado(tx, loteId);
    exigirTransicaoLote({ de: lote.status, para: 'ABERTO', ator: usuario.perfil });
    const nota = await notaAtivaDoLote(tx, loteId);
    if (nota) throw new ErroLotes(`O lote tem NF de Remessa ${ROTULO_SITUACAO_NOTA[nota.situacao].toLowerCase()}: ele não pode ser reaberto.`);
    const [outro] = await tx
      .select({ codigo: lotes.codigo })
      .from(lotes)
      .where(and(eq(lotes.fornecedorId, lote.fornecedorId), eq(lotes.status, 'ABERTO')));
    if (outro) throw new ErroLotes(`O fornecedor já tem o lote ${outro.codigo} aberto: mova as unidades deste lote para ele.`);
    try {
      await tx
        .update(lotes)
        .set({ status: 'ABERTO', tipo: null, fechadoEm: null, fechadoPor: null, atualizadoEm: agora })
        .where(eq(lotes.id, loteId));
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro;
      throw new ErroLotes('O fornecedor já tem outro lote aberto: mova as unidades deste lote para ele.');
    }
    await registrarEvento(tx, { entidade: 'lote', entidadeId: loteId, acao: 'lote_reaberto', de: 'FECHADO', para: 'ABERTO', usuarioId: usuario.id, em: agora });
  });
}

export type DestinoMover = { loteId: string } | { novo: TipoLote };

/** Spec §5.4 (decisões 2 e 3): move unidades entre lotes do mesmo fornecedor; o lote que esvazia continua existindo. */
export async function moverUnidades(
  db: Db,
  p: { loteId: string; itemIds: string[]; destino: DestinoMover },
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ destinoCodigo: string }> {
  exigirPodeGerirLotes(usuario);
  const itemIds = [...new Set(p.itemIds)];
  if (itemIds.length === 0) throw new ErroLotes('Marque pelo menos uma unidade.');
  const destinoId = 'loteId' in p.destino ? p.destino.loteId : null;

  return db.transaction(async (tx) => {
    // Os dois lotes são travados juntos, em ordem de id: dois "mover" em sentidos opostos não se travam.
    const idsLotes = destinoId && destinoId !== p.loteId ? [p.loteId, destinoId] : [p.loteId];
    const travados = await tx.select().from(lotes).where(inArray(lotes.id, idsLotes)).orderBy(asc(lotes.id)).for('update');
    const origem = travados.find((l) => l.id === p.loteId);
    if (!origem) throw new ErroLotes('Lote não encontrado.');
    if (!loteEditavel(origem.status, await notaAtivaDoLote(tx, origem.id))) {
      throw new ErroLotes('Só dá para mover unidades de um lote aberto, ou fechado e ainda sem NF de Remessa.');
    }

    const itens = await tx
      .select({ id: itensDevolucao.id })
      .from(itensDevolucao)
      .where(and(inArray(itensDevolucao.id, itemIds), eq(itensDevolucao.loteId, origem.id), eq(itensDevolucao.status, 'EM_LOTE')))
      .for('update');
    if (itens.length !== itemIds.length) throw new ErroLotes('Uma das unidades marcadas não está neste lote.');

    let destino: { id: string; codigo: string };
    if (destinoId) {
      if (destinoId === origem.id) throw new ErroLotes('Escolha um lote diferente do atual.');
      const existente = travados.find((l) => l.id === destinoId);
      if (!existente) throw new ErroLotes('Lote de destino não encontrado.');
      if (existente.fornecedorId !== origem.fornecedorId) throw new ErroLotes('Só dá para mover unidades entre lotes do mesmo fornecedor.');
      if (!loteEditavel(existente.status, await notaAtivaDoLote(tx, existente.id))) {
        throw new ErroLotes('O lote de destino já tem NF de Remessa ou já foi enviado.');
      }
      destino = existente;
    } else {
      const tipo = (p.destino as { novo: TipoLote }).novo;
      exigirTransicaoLote({ de: null, para: 'FECHADO', ator: usuario.perfil });
      const [criado] = await tx
        .insert(lotes)
        .values({
          fornecedorId: origem.fornecedorId,
          status: 'FECHADO',
          tipo,
          criadoEm: agora,
          fechadoEm: agora,
          fechadoPor: usuario.id,
          atualizadoEm: agora,
        })
        .returning({ id: lotes.id, codigo: lotes.codigo });
      destino = criado;
      await registrarEvento(tx, {
        entidade: 'lote',
        entidadeId: criado.id,
        acao: 'lote_criado',
        de: null,
        para: 'FECHADO',
        usuarioId: usuario.id,
        em: agora,
        dados: { fornecedorId: origem.fornecedorId, origem: origem.codigo },
      });
      await registrarEvento(tx, {
        entidade: 'lote',
        entidadeId: criado.id,
        acao: 'lote_fechado',
        de: null,
        para: 'FECHADO',
        usuarioId: usuario.id,
        em: agora,
        dados: { tipo },
      });
    }

    await tx.update(itensDevolucao).set({ loteId: destino.id }).where(inArray(itensDevolucao.id, itemIds));
    await tx.update(lotes).set({ atualizadoEm: agora }).where(inArray(lotes.id, [origem.id, destino.id]));
    for (const itemId of itemIds) {
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: itemId,
        acao: 'lote_item_movido',
        usuarioId: usuario.id,
        em: agora,
        dados: { de: origem.codigo, para: destino.codigo },
      });
    }
    const dados = { itemIds, de: origem.codigo, para: destino.codigo };
    for (const loteId of [origem.id, destino.id]) {
      await registrarEvento(tx, { entidade: 'lote', entidadeId: loteId, acao: 'lote_item_movido', usuarioId: usuario.id, em: agora, dados });
    }
    return { destinoCodigo: destino.codigo };
  });
}
