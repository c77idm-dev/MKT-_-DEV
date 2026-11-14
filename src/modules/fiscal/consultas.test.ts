import { describe, expect, it } from 'vitest';
import { esperaAntesDaConsulta, LIMITE_CONSULTAS } from './consultas';

describe('espera antes de cada consulta (D12)', () => {
  it('1ª na hora; depois 10 s, 30 s, 1 min, 2 min, 5 min e a cada 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(esperaAntesDaConsulta)).toEqual([0, 10, 30, 60, 120, 300, 600, 600]);
  });

  it('o limite dá cerca de 24 h de consultas', () => {
    let total = 0;
    for (let n = 1; n <= LIMITE_CONSULTAS; n++) total += esperaAntesDaConsulta(n);
    expect(total / 3600).toBeGreaterThan(23);
    expect(total / 3600).toBeLessThan(25);
  });
});
