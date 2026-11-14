import { and, count, desc, eq, ne } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { itensDevolucao, lotes, notasFiscais } from '@/db/schema';
import type { NotaFiscalLinha } from '@/modules/fiscal/notas';

export type LoteLinha = typeof lotes.$inferSelect;

/** `travar` pega o lote com FOR UPDATE (use dentro de transação, antes de mudar o lote ou suas unidades). */
export async function obterLote(db: DbOuTx, loteId: string, opcoes: { travar?: boolean } = {}): Promise<LoteLinha | null> {
  const consulta = db.select().from(lotes).where(eq(lotes.id, loteId));
  const [lote] = await (opcoes.travar ? consulta.for('update') : consulta);
  return lote ?? null;
}

export async function obterLotePorCodigo(db: DbOuTx, codigo: string): Promise<LoteLinha | null> {
  const [lote] = await db.select().from(lotes).where(eq(lotes.codigo, codigo));
  return lote ?? null;
}

export async function contarUnidades(db: DbOuTx, loteId: string): Promise<number> {
  const [linha] = await db.select({ total: count() }).from(itensDevolucao).where(eq(itensDevolucao.loteId, loteId));
  return linha?.total ?? 0;
}

/** A NF de remessa mais nova do lote que não foi cancelada. */
export async function notaAtivaDoLote(db: DbOuTx, loteId: string): Promise<NotaFiscalLinha | null> {
  const [nota] = await db
    .select()
    .from(notasFiscais)
    .where(and(eq(notasFiscais.loteId, loteId), ne(notasFiscais.situacao, 'CANCELADA')))
    .orderBy(desc(notasFiscais.criadaEm))
    .limit(1);
  return nota ?? null;
}
