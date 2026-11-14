import { describe, expect, it } from 'vitest';
import { mensagemDoErro } from './log';

describe('mensagemDoErro (decisão 6)', () => {
  it('só a message do erro que o pg-boss guardou, sem a pilha', () => {
    expect(mensagemDoErro({ name: 'Error', message: 'Focus fora do ar', stack: 'Error: Focus fora do ar\n    at x (y.ts:1)' })).toBe('Focus fora do ar');
  });
  it('o tempo esgotado do pg-boss vira "Tempo esgotado"', () => {
    expect(mensagemDoErro({ value: { message: 'job timed out' } })).toBe('Tempo esgotado');
    expect(mensagemDoErro({ value: { message: 'outra coisa' } })).toBe('outra coisa');
    expect(mensagemDoErro({ name: 'Error', message: 'handler execution exceeded 300s' })).toBe('Tempo esgotado');
  });
  it('texto simples, vazio e outros formatos', () => {
    expect(mensagemDoErro('tempo esgotado')).toBe('tempo esgotado');
    expect(mensagemDoErro(null)).toBe('Sem detalhes do erro.');
    expect(mensagemDoErro({ value: 'x' })).toBe('{"value":"x"}');
  });
  it('corta em 500 caracteres e tira caracteres de controle', () => {
    const longa = mensagemDoErro({ message: 'a'.repeat(600) });
    expect(longa).toHaveLength(500);
    expect(longa.endsWith('…')).toBe(true);
    expect(mensagemDoErro({ message: 'linha 1\nlinha 2\u0000' })).toBe('linha 1 linha 2');
  });
});
