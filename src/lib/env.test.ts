import { describe, expect, it } from 'vitest';
import { lerEnv } from './env';

describe('lerEnv', () => {
  it('exige DATABASE_URL', () => {
    expect(() => lerEnv({})).toThrow(/DATABASE_URL/);
  });

  it('devolve as variáveis válidas com NODE_ENV padrão', () => {
    expect(lerEnv({ DATABASE_URL: 'postgres://u:s@h:5432/b' })).toEqual({
      DATABASE_URL: 'postgres://u:s@h:5432/b',
      NODE_ENV: 'development',
    });
  });
});
