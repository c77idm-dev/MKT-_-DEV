import { describe, expect, it } from 'vitest';
import { diasParaSumir, mensagemApagada, PRAZO_APAGADAS_DIAS, textoSomeEm } from './dominio';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-27T15:00:00Z');

describe('Apagadas: o prazo de 90 dias (E29)', () => {
  it('o prazo é de 90 dias', () => {
    expect(PRAZO_APAGADAS_DIAS).toBe(90);
  });

  it('conta os dias que faltam, arredondando para cima, e nunca menos de 0', () => {
    expect(diasParaSumir(AGORA, AGORA)).toBe(90);
    expect(diasParaSumir(new Date(AGORA.getTime() - 1), AGORA)).toBe(90);
    expect(diasParaSumir(new Date(AGORA.getTime() - DIA), AGORA)).toBe(89);
    expect(diasParaSumir(new Date(AGORA.getTime() - 89.5 * DIA), AGORA)).toBe(1);
    expect(diasParaSumir(new Date(AGORA.getTime() - 91 * DIA), AGORA)).toBe(0);
  });

  it('o texto da lista e a confirmação depois de apagar', () => {
    expect(textoSomeEm(90)).toBe('Some de vez em 90 dias');
    expect(textoSomeEm(1)).toBe('Some de vez em 1 dia');
    expect(textoSomeEm(0)).toBe('Some de vez hoje');
    expect(mensagemApagada('DEV-000123')).toBe('DEV-000123 apagada. Ela fica em Apagadas por 90 dias.');
  });
});
