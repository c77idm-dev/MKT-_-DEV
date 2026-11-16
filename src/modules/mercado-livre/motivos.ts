import { eq } from 'drizzle-orm';
import { logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import { motivosReclamacaoMl } from '@/db/schema';

/** Texto do motivo já guardado no cache (melhoria 1). */
export async function motivoEmCache(db: DbOuTx, motivoId: string | null): Promise<string | null> {
  if (!motivoId) return null;
  const [m] = await db.select({ nome: motivosReclamacaoMl.nome }).from(motivosReclamacaoMl).where(eq(motivosReclamacaoMl.id, motivoId));
  return m?.nome ?? null;
}

/**
 * Garante o texto do motivo no cache: um código já consultado não é pedido de novo ao ML. Qualquer falha da consulta
 * (rede, 404, formato) só vai ao log, sem o corpo da resposta, e devolve null: a sincronização segue e tenta de novo
 * na próxima vez.
 */
export async function garantirTextoMotivo(
  db: DbOuTx,
  conector: Pick<ConectorMercadoLivre, 'obterMotivoReclamacao'>,
  motivoId: string | null,
  agora: Date,
): Promise<string | null> {
  if (!motivoId) return null;
  const guardado = await motivoEmCache(db, motivoId);
  if (guardado) return guardado;
  let nome: string | null;
  try {
    nome = await conector.obterMotivoReclamacao(motivoId);
  } catch (erro) {
    logErroML('motivo da reclamação', erro, { motivoId });
    return null;
  }
  if (!nome) {
    logErroML('motivo da reclamação', new Error('resposta sem o texto do motivo'), { motivoId });
    return null;
  }
  await db
    .insert(motivosReclamacaoMl)
    .values({ id: motivoId, nome, consultadoEm: agora })
    .onConflictDoUpdate({ target: motivosReclamacaoMl.id, set: { nome, consultadoEm: agora } });
  return nome;
}
