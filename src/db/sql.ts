import { sql, type SQL } from 'drizzle-orm';

/** Num upsert: usa o valor novo, mas mantém o atual quando o novo vem vazio (a planilha nunca apaga dado). */
export function manterSeVazio(tabela: string, coluna: string): SQL {
  return sql.raw(`coalesce(excluded."${coluna}", "${tabela}"."${coluna}")`);
}

/** No RETURNING de um upsert: true quando a linha foi inserida, false quando foi atualizada. */
export const FOI_INSERIDO = sql<boolean>`(xmax = 0)`;
