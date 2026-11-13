import { describe, expect, it } from 'vitest';
import { seloPrazoML } from './selos';

describe('seloPrazoML (spec §6.6: o prazo do ML em destaque)', () => {
  const agora = new Date('2026-11-12T15:00:00Z');
  it('sem prazo: sem selo', () => {
    expect(seloPrazoML(null, agora)).toBeNull();
  });
  it('vencido: erro', () => {
    expect(seloPrazoML(new Date('2026-11-12T14:00:00Z'), agora)).toEqual({ texto: 'Prazo do ML vencido', tom: 'erro' });
  });
  it('1 dia ou menos: erro; mais que isso: atenção (horário de Brasília)', () => {
    expect(seloPrazoML(new Date('2026-11-13T12:00:00Z'), agora)).toEqual({ texto: 'Prazo 13/11/2026 09:00', tom: 'erro' });
    expect(seloPrazoML(new Date('2026-11-20T15:00:00Z'), agora)).toEqual({ texto: 'Prazo 20/11/2026 12:00', tom: 'atencao' });
  });
});
