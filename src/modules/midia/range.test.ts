import { describe, expect, it } from 'vitest';
import { interpretarRange } from './range';

describe('interpretarRange (vídeo no navegador pede pedaços)', () => {
  it('sem cabeçalho: arquivo inteiro', () => {
    expect(interpretarRange(null, 100)).toBeNull();
  });

  it.each([
    ['bytes=0-9', { inicio: 0, fim: 9 }],
    ['bytes=90-', { inicio: 90, fim: 99 }],
    ['bytes=-10', { inicio: 90, fim: 99 }],
    ['bytes=50-500', { inicio: 50, fim: 99 }],
  ])('%s', (cabecalho, esperado) => {
    expect(interpretarRange(cabecalho, 100)).toEqual(esperado);
  });

  it.each(['bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=-', 'itens=0-1', 'bytes=0-1,5-6'])('%s é inválido', (cabecalho) => {
    expect(interpretarRange(cabecalho, 100)).toBe('invalido');
  });
});
