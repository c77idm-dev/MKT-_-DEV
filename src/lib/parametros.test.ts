import { describe, expect, it } from 'vitest';
import { lerPagina, primeiroValor } from './parametros';

describe('parâmetros da URL', () => {
  it('primeiroValor pega o primeiro e apara', () => {
    expect(primeiroValor(['a', 'b'])).toBe('a');
    expect(primeiroValor('  x ')).toBe('x');
    expect(primeiroValor(undefined)).toBe('');
  });

  it('lerPagina aceita só inteiros a partir de 1', () => {
    expect(lerPagina({ pagina: '3' })).toBe(3);
    expect(lerPagina({ pagina: '0' })).toBe(1);
    expect(lerPagina({ pagina: 'abc' })).toBe(1);
    expect(lerPagina({})).toBe(1);
  });
});
