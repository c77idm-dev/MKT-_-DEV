import type { Sql } from 'postgres';

export type ResultadoSaude = { status: 'ok' | 'erro'; banco: 'ok' | 'falhou' };

export async function verificarSaude(sql: Sql): Promise<ResultadoSaude> {
  try {
    await sql`select 1`;
    return { status: 'ok', banco: 'ok' };
  } catch {
    return { status: 'erro', banco: 'falhou' };
  }
}
