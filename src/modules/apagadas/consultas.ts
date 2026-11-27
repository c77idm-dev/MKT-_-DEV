import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, retiradasFull, usuarios } from '@/db/schema';
import { ROTULO_STATUS } from '@/modules/devolucoes/dominio';
import { ROTULO_SITUACAO_RETIRADA } from '@/modules/retiradas/dominio';
import { diasParaSumir } from './dominio';

/** Até onde a lista vai (cada tipo). Em 90 dias, o normal é bem menos. */
export const LIMITE_APAGADAS = 300;

export type ItemApagado = {
  tipo: 'devolucao' | 'retirada';
  id: string;
  codigo: string;
  /** O status (devolução) ou a situação (retirada) em que ela estava, e para onde volta ao restaurar. */
  situacao: string;
  apagadaEm: Date;
  apagadaPorNome: string | null;
  diasParaSumir: number;
};

/**
 * Lista "Apagadas" (extra, emenda E29), só do Gestor: as devoluções e as retiradas apagadas e ainda não expurgadas pela
 * tarefa dos 90 dias, a mais recente primeiro.
 */
export async function listarApagadas(db: DbOuTx, agora: Date = new Date()): Promise<ItemApagado[]> {
  const devs = await db
    .select({ id: devolucoes.id, codigo: devolucoes.codigo, status: devolucoes.status, apagadaEm: devolucoes.apagadaEm, apagadaPorNome: usuarios.nome })
    .from(devolucoes)
    .leftJoin(usuarios, eq(usuarios.id, devolucoes.apagadaPor))
    .where(and(isNotNull(devolucoes.apagadaEm), isNull(devolucoes.expurgadaEm)))
    .orderBy(desc(devolucoes.apagadaEm))
    .limit(LIMITE_APAGADAS);
  const rets = await db
    .select({
      id: retiradasFull.id,
      codigo: retiradasFull.codigo,
      situacao: retiradasFull.situacao,
      apagadaEm: retiradasFull.apagadaEm,
      apagadaPorNome: usuarios.nome,
    })
    .from(retiradasFull)
    .leftJoin(usuarios, eq(usuarios.id, retiradasFull.apagadaPor))
    .where(isNotNull(retiradasFull.apagadaEm))
    .orderBy(desc(retiradasFull.apagadaEm))
    .limit(LIMITE_APAGADAS);

  const itens: ItemApagado[] = [
    ...devs.map((d) => ({ tipo: 'devolucao' as const, id: d.id, codigo: d.codigo, situacao: ROTULO_STATUS[d.status], apagadaEm: d.apagadaEm!, apagadaPorNome: d.apagadaPorNome })),
    ...rets.map((r) => ({
      tipo: 'retirada' as const,
      id: r.id,
      codigo: r.codigo,
      situacao: ROTULO_SITUACAO_RETIRADA[r.situacao],
      apagadaEm: r.apagadaEm!,
      apagadaPorNome: r.apagadaPorNome,
    })),
  ].map((i) => ({ ...i, diasParaSumir: diasParaSumir(i.apagadaEm, agora) }));
  return itens.sort((a, b) => b.apagadaEm.getTime() - a.apagadaEm.getTime());
}
