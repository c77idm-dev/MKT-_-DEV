import { describe, expect, it } from 'vitest';
import { interpretarData, interpretarInteiro, interpretarValor, textoOpcional } from './valores';

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

describe('interpretarInteiro', () => {
  it.each([
    ['3', 3],
    ['3.0', 3],
    ['3,0', 3],
    ['12.0', 12],
    ['1.000', 1000],
    ['1.234.567', 1234567],
  ])('%s → %d', (texto, n) => {
    expect(interpretarInteiro(texto)).toBe(n);
  });

  it.each(['2.5', 'abc', '', '-1', '10.00', '1,5', '1.0000', '12.5'])('recusa %j', (texto) => {
    expect(interpretarInteiro(texto)).toBeNull();
  });
});

describe('interpretarData', () => {
  it.each([
    ['05/11/2026', '2026-11-05'],
    ['5/11/2026', '2026-11-05'],
    ['2026-11-05', '2026-11-05'],
    ['29/02/2028', '2028-02-29'],
  ])('%s → %s', (texto, iso) => {
    expect(interpretarData(texto)).toBe(iso);
  });

  it.each(['31/02/2026', '2026-13-01', 'ontem', '2026-02-31', '29/02/2026', '2026/11/05'])('recusa %j', (texto) => {
    expect(interpretarData(texto)).toBeNull();
  });
});
