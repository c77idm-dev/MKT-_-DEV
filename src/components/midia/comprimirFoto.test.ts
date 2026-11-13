import { describe, expect, it } from 'vitest';
import { dimensoesAlvo } from './comprimirFoto';

describe('dimensoesAlvo (spec §9: ~1600 px no maior lado)', () => {
  it('reduz mantendo a proporção, deitada ou em pé', () => {
    expect(dimensoesAlvo(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesAlvo(3024, 4032)).toEqual({ largura: 1200, altura: 1600 });
  });

  it('não amplia foto pequena', () => {
    expect(dimensoesAlvo(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});
