import { describe, expect, it } from 'vitest';
import { iniciais } from './iniciais';

describe('iniciais', () => {
  it('usa a primeira letra do primeiro e do último nome', () => {
    expect(iniciais('Maria da Silva')).toBe('MS');
  });
  it('usa uma letra só quando há um nome só', () => {
    expect(iniciais('joão')).toBe('J');
  });
  it('devolve ? para nome vazio', () => {
    expect(iniciais('   ')).toBe('?');
  });
});
