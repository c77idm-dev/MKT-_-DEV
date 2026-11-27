import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

type Coluna = { table_name: string; column_name: string; data_type: string; is_nullable: string };

async function colunas(tabela: string): Promise<Map<string, Coluna>> {
  const linhas = await db.execute<Coluna>(
    sqlDrizzle`select table_name, column_name, data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = ${tabela}`,
  );
  return new Map([...linhas].map((l) => [l.column_name, l]));
}

async function referenciaUsuarios(tabela: string, coluna: string): Promise<boolean> {
  const linhas = await db.execute<{ alvo: string }>(
    sqlDrizzle`select ccu.table_name as alvo
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_name = ${tabela} and kcu.column_name = ${coluna}`,
  );
  return [...linhas].some((l) => l.alvo === 'usuarios');
}

describe('migração 0018: apagar esconde, não exclui (E29)', () => {
  it('devolucoes ganha apagada_em, apagada_por (FK usuarios) e expurgada_em, todos opcionais', async () => {
    const c = await colunas('devolucoes');
    expect(c.get('apagada_em')).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' });
    expect(c.get('apagada_por')).toMatchObject({ data_type: 'uuid', is_nullable: 'YES' });
    expect(c.get('expurgada_em')).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' });
    expect(await referenciaUsuarios('devolucoes', 'apagada_por')).toBe(true);
  });

  it('retiradas_full ganha apagada_em e apagada_por (FK usuarios), sem expurgada_em', async () => {
    const c = await colunas('retiradas_full');
    expect(c.get('apagada_em')).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' });
    expect(c.get('apagada_por')).toMatchObject({ data_type: 'uuid', is_nullable: 'YES' });
    expect(c.has('expurgada_em')).toBe(false);
    expect(await referenciaUsuarios('retiradas_full', 'apagada_por')).toBe(true);
  });
});
