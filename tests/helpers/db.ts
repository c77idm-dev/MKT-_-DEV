import type { Sql } from 'postgres';
import { criarDb } from '@/db/client';

export function urlBancoTeste(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  // Trava: `limparTabelas` apaga tudo, então só aceitamos bancos de teste (nunca o de desenvolvimento).
  const banco = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (banco !== 'devolucoes_test' && !/^devolucoes_test_f\d+$/.test(banco)) {
    throw new Error(`DATABASE_URL_TEST aponta para "${banco}"; o banco de testes deve se chamar devolucoes_test ou devolucoes_test_f<N>`);
  }
  return url;
}

export function criarDbTeste() {
  return criarDb(urlBancoTeste());
}

/** Esvazia todas as tabelas do schema public. A tabela de controle das migrações fica no schema "drizzle" e não é tocada. */
export async function limparTabelas(sql: Sql): Promise<void> {
  const tabelas = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'`;
  if (tabelas.length === 0) return;
  const lista = tabelas.map((t) => `"${t.tablename}"`).join(', ');
  await sql.unsafe(`truncate table ${lista} restart identity cascade`);
}
