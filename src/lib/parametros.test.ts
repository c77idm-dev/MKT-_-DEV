import { describe, expect, it } from 'vitest';
import { lerPagina } from './parametros';

describe('lerPagina', () => {
  it('lê inteiros de 1 a 10000 e usa 1 para o resto', () => {
    expect(lerPagina({ pagina: '3' })).toBe(3);
    expect(lerPagina({})).toBe(1);
    expect(lerPagina({ pagina: '0' })).toBe(1);
    expect(lerPagina({ pagina: '-2' })).toBe(1);
    expect(lerPagina({ pagina: 'abc' })).toBe(1);
    expect(lerPagina({ pagina: '2.5' })).toBe(1);
  });

  it('limita a 10000: "1e20" ou números enormes não estouram o offset do banco', () => {
    expect(lerPagina({ pagina: '10000' })).toBe(10_000);
    expect(lerPagina({ pagina: '10001' })).toBe(10_000);
    expect(lerPagina({ pagina: '1e20' })).toBe(10_000);
    expect(lerPagina({ pagina: '99999999999999999999' })).toBe(10_000);
  });
});
