import { describe, expect, it } from 'vitest';
import { lerCookie } from './cookie';

describe('lerCookie', () => {
  it('acha o cookie pelo nome', () => {
    expect(lerCookie('a=1; sessao=abc-DEF_123; b=2', 'sessao')).toBe('abc-DEF_123');
    expect(lerCookie('sessao=x', 'sessao')).toBe('x');
  });

  it('devolve null quando não existe', () => {
    expect(lerCookie(null, 'sessao')).toBeNull();
    expect(lerCookie('outra=1', 'sessao')).toBeNull();
    expect(lerCookie('minhasessao=1', 'sessao')).toBeNull();
  });
});
