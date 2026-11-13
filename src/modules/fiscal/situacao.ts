import { inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';

/** id → código DEV, para as mensagens da emissão em lote. */
export async function codigosDasDevolucoes(db: DbOuTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const linhas = await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(inArray(devolucoes.id, ids));
  return new Map(linhas.map((l) => [l.id, l.codigo]));
}
