import { afterEach, describe, expect, it, vi } from 'vitest';
import { urlBancoTeste } from './db';

const base = 'postgres://devolucoes:devolucoes@localhost:5432/';

afterEach(() => vi.unstubAllEnvs());

describe('urlBancoTeste (trava contra apagar o banco de desenvolvimento)', () => {
  it.each(['devolucoes_test', 'devolucoes_test_f3', 'devolucoes_test_f12'])('aceita %s', (nome) => {
    vi.stubEnv('DATABASE_URL_TEST', base + nome);
    expect(urlBancoTeste()).toBe(base + nome);
  });

  it.each(['devolucoes', 'devolucoes_f2', 'devolucoes_test_x', 'postgres'])('recusa %s', (nome) => {
    vi.stubEnv('DATABASE_URL_TEST', base + nome);
    expect(() => urlBancoTeste()).toThrow(/devolucoes_test/);
  });

  it('recusa quando a variável não está definida', () => {
    vi.stubEnv('DATABASE_URL_TEST', '');
    expect(() => urlBancoTeste()).toThrow(/DATABASE_URL_TEST/);
  });
});
