import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { registrarEvento } from '@/modules/historico/eventos';
import { RASTREIO_ENVIO_MAXIMO, type ResultadoFornecedor } from './dominio';
import { ErroLotes } from './erros';
import { exigirPodeGerirLotes, obterLote } from './repositorio';
import { exigirTransicaoLote } from './transicoes-lote';

/** Spec §5.4: NF_EMITIDA → ENVIADO com o rastreio; as unidades EM_LOTE vão para ENVIADO. */
export async function registrarEnvio(db: Db, loteId: string, rastreio: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirPodeGerirLotes(usuario);
  const codigo = rastreio.trim();
  if (codigo === '') throw new ErroLotes('Informe o código de rastreamento do envio.');
  if (codigo.length > RASTREIO_ENVIO_MAXIMO) throw new ErroLotes(`O código de rastreamento tem no máximo ${RASTREIO_ENVIO_MAXIMO} caracteres.`);

  await db.transaction(async (tx) => {
    const lote = await obterLote(tx, loteId, { travar: true });
    if (!lote) throw new ErroLotes('Lote não encontrado.');
    if (lote.status === 'ENVIADO' || lote.status === 'FINALIZADO') throw new ErroLotes('O envio deste lote já foi registrado.');
    if (lote.status !== 'NF_EMITIDA') throw new ErroLotes('O envio só é registrado depois da NF de Remessa autorizada.');
    exigirTransicaoLote({ de: 'NF_EMITIDA', para: 'ENVIADO', ator: usuario.perfil });

    const itens = await tx
      .select({ id: itensDevolucao.id })
      .from(itensDevolucao)
      .where(and(eq(itensDevolucao.loteId, loteId), eq(itensDevolucao.status, 'EM_LOTE')))
      .orderBy(asc(itensDevolucao.id))
      .for('update');
    for (const item of itens) {
      exigirTransicaoItem({ de: 'EM_LOTE', para: 'ENVIADO', ator: usuario.perfil });
      await tx.update(itensDevolucao).set({ status: 'ENVIADO' }).where(eq(itensDevolucao.id, item.id));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: item.id,
        acao: 'item_status',
        de: 'EM_LOTE',
        para: 'ENVIADO',
        usuarioId: usuario.id,
        em: agora,
        dados: { loteId, loteCodigo: lote.codigo, rastreio: codigo },
      });
    }
    await tx.update(lotes).set({ status: 'ENVIADO', rastreioEnvio: codigo, enviadoEm: agora, atualizadoEm: agora }).where(eq(lotes.id, loteId));
    await registrarEvento(tx, {
      entidade: 'lote',
      entidadeId: loteId,
      acao: 'lote_enviado',
      de: 'NF_EMITIDA',
      para: 'ENVIADO',
      usuarioId: usuario.id,
      em: agora,
      dados: { rastreio: codigo },
    });
  });
}

export type ResultadoUnidade = { itemId: string; resultado: ResultadoFornecedor };

/** Spec §5.3/§5.4: ENVIADO → RESOLVIDO por unidade; com a última resolvida o lote vira FINALIZADO (pelo sistema). */
export async function registrarResultados(
  db: Db,
  loteId: string,
  resultados: ResultadoUnidade[],
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ registrados: number; finalizado: boolean }> {
  exigirPodeGerirLotes(usuario);
  if (resultados.length === 0) throw new ErroLotes('Escolha o resultado de pelo menos uma unidade.');

  return db.transaction(async (tx) => {
    const lote = await obterLote(tx, loteId, { travar: true });
    if (!lote) throw new ErroLotes('Lote não encontrado.');
    if (lote.status !== 'ENVIADO') throw new ErroLotes('O resultado só é registrado depois do envio.');

    // Ordem fixa de id evita impasse entre dois registros simultâneos.
    const ordenados = [...resultados].sort((a, b) => a.itemId.localeCompare(b.itemId));
    for (let i = 1; i < ordenados.length; i++) {
      if (ordenados[i].itemId === ordenados[i - 1].itemId) throw new ErroLotes('A mesma unidade foi escolhida mais de uma vez.');
    }
    for (const r of ordenados) {
      const [item] = await tx
        .select({ id: itensDevolucao.id, status: itensDevolucao.status, loteId: itensDevolucao.loteId, unidade: itensDevolucao.unidade })
        .from(itensDevolucao)
        .where(eq(itensDevolucao.id, r.itemId))
        .for('update');
      if (!item || item.loteId !== loteId) throw new ErroLotes('Uma das unidades não está neste lote.');
      if (item.status === 'RESOLVIDO') throw new ErroLotes('A unidade já tem resultado registrado.');
      exigirTransicaoItem({ de: 'ENVIADO', para: 'RESOLVIDO', ator: usuario.perfil });
      await tx.update(itensDevolucao).set({ status: 'RESOLVIDO', resultadoFornecedor: r.resultado }).where(eq(itensDevolucao.id, r.itemId));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: r.itemId,
        acao: 'item_status',
        de: 'ENVIADO',
        para: 'RESOLVIDO',
        usuarioId: usuario.id,
        em: agora,
        dados: { loteId, loteCodigo: lote.codigo, resultado: r.resultado },
      });
      await registrarEvento(tx, {
        entidade: 'lote',
        entidadeId: loteId,
        acao: 'lote_resultado_registrado',
        usuarioId: usuario.id,
        em: agora,
        dados: { itemId: r.itemId, unidade: item.unidade, resultado: r.resultado },
      });
    }

    const restantes = await tx
      .select({ id: itensDevolucao.id })
      .from(itensDevolucao)
      .where(and(eq(itensDevolucao.loteId, loteId), eq(itensDevolucao.status, 'ENVIADO')))
      .limit(1);
    const finalizado = restantes.length === 0;
    if (finalizado) {
      exigirTransicaoLote({ de: 'ENVIADO', para: 'FINALIZADO', ator: 'SISTEMA' });
      await tx.update(lotes).set({ status: 'FINALIZADO', finalizadoEm: agora, atualizadoEm: agora }).where(eq(lotes.id, loteId));
      await registrarEvento(tx, {
        entidade: 'lote',
        entidadeId: loteId,
        acao: 'lote_finalizado',
        de: 'ENVIADO',
        para: 'FINALIZADO',
        usuarioId: null,
        em: agora,
      });
    } else {
      await tx.update(lotes).set({ atualizadoEm: agora }).where(eq(lotes.id, loteId));
    }
    return { registrados: ordenados.length, finalizado };
  });
}
