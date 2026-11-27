import { and, eq } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { retiradasFull } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { retiradaVisivel } from '@/modules/apagadas/filtro';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { ErroRetirada } from './erros';

/**
 * Corrigir (Gestor) na Retirada do Full (extra, emenda E29, itens 7 e 8). Como na devolução: só o Gestor
 * (`administrar`), numa transação com a retirada travada (FOR UPDATE), com evento `{ antes, depois }` e recusa com a
 * mensagem do motivo.
 */
function exigirGestor(usuario: UsuarioSessao, mensagem: string): void {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroRetirada(mensagem);
}

async function travar(tx: DbOuTx, retiradaId: string, opcoes: { incluirApagada?: boolean } = {}) {
  if (!ehUuid(retiradaId)) throw new ErroRetirada('Retirada não encontrada.');
  const [r] = await tx
    .select({
      id: retiradasFull.id,
      situacao: retiradasFull.situacao,
      concluidaEm: retiradasFull.concluidaEm,
      apagadaEm: retiradasFull.apagadaEm,
      apagadaPor: retiradasFull.apagadaPor,
    })
    .from(retiradasFull)
    .where(and(eq(retiradasFull.id, retiradaId), opcoes.incluirApagada ? undefined : retiradaVisivel))
    .for('update');
  if (!r) throw new ErroRetirada('Retirada não encontrada.');
  return r;
}

/** Item 7: Conferida → Aberta, limpando `concluida_em` (CHECK retiradas_full_concluida), para corrigir itens e quantidades. */
export async function reabrirRetirada(db: Db, retiradaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario, 'Só o Gestor reabre retiradas.');
  await db.transaction(async (tx) => {
    const r = await travar(tx, retiradaId);
    if (r.situacao !== 'CONFERIDA') throw new ErroRetirada('Esta retirada já está Aberta.');
    await tx.update(retiradasFull).set({ situacao: 'ABERTA', concluidaEm: null }).where(eq(retiradasFull.id, r.id));
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: r.id,
      acao: 'retirada_reaberta',
      de: 'CONFERIDA',
      para: 'ABERTA',
      usuarioId: usuario.id,
      em: agora,
      dados: { antes: { situacao: 'CONFERIDA', concluidaEm: r.concluidaEm?.toISOString() ?? null }, depois: { situacao: 'ABERTA', concluidaEm: null } },
    });
  });
}

/**
 * Item 8: apagar esconde, não exclui (`apagada_em`, `apagada_por`; filtro `retiradaVisivel`). As devoluções que tiveram
 * chegada pela etiqueta amarela dentro dela não mudam (se precisar, o Gestor usa "Desfazer a chegada" nelas).
 */
export async function apagarRetirada(db: Db, retiradaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario, 'Só o Gestor apaga retiradas.');
  await db.transaction(async (tx) => {
    const r = await travar(tx, retiradaId, { incluirApagada: true });
    if (r.apagadaEm) throw new ErroRetirada('Esta retirada já está apagada.');
    await tx.update(retiradasFull).set({ apagadaEm: agora, apagadaPor: usuario.id }).where(eq(retiradasFull.id, r.id));
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: r.id,
      acao: 'retirada_apagada',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        antes: { apagadaEm: null, apagadaPor: null },
        depois: { apagadaEm: agora.toISOString(), apagadaPor: usuario.id },
        situacao: r.situacao,
      },
    });
  });
}

/** "Restaurar" da lista Apagadas: limpa a marca; a retirada volta exatamente como estava (Aberta ou Conferida). */
export async function restaurarRetirada(db: Db, retiradaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario, 'Só o Gestor restaura retiradas.');
  await db.transaction(async (tx) => {
    const r = await travar(tx, retiradaId, { incluirApagada: true });
    if (!r.apagadaEm) throw new ErroRetirada('Esta retirada não está apagada.');
    await tx.update(retiradasFull).set({ apagadaEm: null, apagadaPor: null }).where(eq(retiradasFull.id, r.id));
    await registrarEvento(tx, {
      entidade: 'retirada_full',
      entidadeId: r.id,
      acao: 'retirada_restaurada',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        antes: { apagadaEm: r.apagadaEm.toISOString(), apagadaPor: r.apagadaPor },
        depois: { apagadaEm: null, apagadaPor: null },
        situacao: r.situacao,
      },
    });
  });
}
