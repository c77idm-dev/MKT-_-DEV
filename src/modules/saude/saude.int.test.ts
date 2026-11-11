import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDbTeste } from '../../../tests/helpers/db';
import { verificarSaude } from './saude';

const { sql } = criarDbTeste();
afterAll(async () => {
  await sql.end();
});

describe('verificarSaude', () => {
  it('responde ok quando o banco atende', async () => {
    expect(await verificarSaude(sql)).toEqual({ status: 'ok', banco: 'ok' });
  });

  it('responde erro quando o banco não atende', async () => {
    const quebrado = postgres('postgres://ninguem:nada@127.0.0.1:1/nada', { max: 1, connect_timeout: 1 });
    try {
      expect(await verificarSaude(quebrado)).toEqual({ status: 'erro', banco: 'falhou' });
    } finally {
      await quebrado.end({ timeout: 0 });
    }
  });
});
