import { describe, expect, it } from 'vitest';
import { mensagemOkConexao } from './mensagem-ok';

describe('mensagemOkConexao (?ok= da tela do Mercado Livre)', () => {
  it('devolve o texto das chaves conhecidas', () => {
    expect(mensagemOkConexao('conectada')).toBe('Conta do Mercado Livre conectada.');
    expect(mensagemOkConexao('desconectada')).toBe('Conta do Mercado Livre desconectada.');
  });
  it('ignora chaves desconhecidas e as herdadas do protótipo', () => {
    for (const chave of ['', 'xyz', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(mensagemOkConexao(chave)).toBeNull();
    }
  });
});
