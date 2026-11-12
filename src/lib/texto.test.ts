import { describe, expect, it } from 'vitest';
import { escaparLike, normalizarTexto } from './texto';

describe('normalizarTexto', () => {
  it('tira acentos, maiúsculas e pontuação', () => {
    expect(normalizarTexto('  Código de Barras ')).toBe('codigo de barras');
    expect(normalizarTexto('E-mail SAC')).toBe('e mail sac');
    expect(normalizarTexto('Preço de custo (R$)')).toBe('preco de custo r');
  });
});

describe('escaparLike', () => {
  it('escapa %, _ e a barra invertida', () => {
    expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});
