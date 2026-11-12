import { describe, expect, it } from 'vitest';
import { interpretarValor, textoOpcional } from './valores';

describe('interpretarValor', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['12,5', '12.50'],
    ['12.5', '12.50'],
    ['1234', '1234.00'],
    ['1.234', '1234.00'],
    ['1234.56', '1234.56'],
    ['1.234.567', '1234567.00'],
    ['R$ 89,90', '89.90'],
    [' 0 ', '0.00'],
  ])('%s → %s', (texto, esperado) => {
    expect(interpretarValor(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '-5', '12,3,4', '1.2.3', '1,234.56', '1.234.5'])('recusa %j', (texto) => {
    expect(interpretarValor(texto)).toBeNull();
  });
});

describe('textoOpcional', () => {
  it('apara e devolve null quando vazio', () => {
    const erros: string[] = [];
    expect(textoOpcional('  Rua A ', 10, 'Logradouro', erros)).toBe('Rua A');
    expect(textoOpcional('   ', 10, 'Logradouro', erros)).toBeNull();
    expect(textoOpcional(undefined, 10, 'Logradouro', erros)).toBeNull();
    expect(erros).toEqual([]);
  });

  it('anota o erro quando passa do limite', () => {
    const erros: string[] = [];
    expect(textoOpcional('abcdef', 5, 'Número', erros)).toBeNull();
    expect(erros).toEqual(['Número: no máximo 5 caracteres']);
  });
});
