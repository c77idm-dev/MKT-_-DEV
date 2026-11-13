import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDbTeste } from '../../../tests/helpers/db';
import { verificarSaude } from './saude';

const { sql } = criarDbTeste();
afterAll(async () => {
  await sql.end();
});
const filaOk = async () => {};

describe('verificarSaude (spec §11: banco e fila)', () => {
  it('responde ok quando o banco e a fila atendem', async () => {
    expect(await verificarSaude(sql, filaOk)).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
  });

  it('responde erro quando o banco não atende', async () => {
    const quebrado = postgres('postgres://ninguem:nada@127.0.0.1:1/nada', { max: 1, connect_timeout: 1 });
    try {
      expect(await verificarSaude(quebrado, filaOk)).toEqual({ status: 'erro', banco: 'falhou', fila: 'ok' });
    } finally {
      await quebrado.end({ timeout: 0 });
    }
  });

  it('responde erro quando a fila falha ou não responde a tempo', async () => {
    expect(await verificarSaude(sql, async () => Promise.reject(new Error('fora')))).toEqual({ status: 'erro', banco: 'ok', fila: 'falhou' });
    expect(await verificarSaude(sql, () => new Promise<void>(() => {}), 50)).toEqual({ status: 'erro', banco: 'ok', fila: 'falhou' });
  });
});
