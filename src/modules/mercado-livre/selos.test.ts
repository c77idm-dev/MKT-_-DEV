import { describe, expect, it } from 'vitest';
import { selosExtrasML, seloPrazoML } from './selos';

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

describe('selosExtrasML (§4.5)', () => {
  const prazo = new Date('2026-11-20T15:00:00Z');
  it('Urgente com o prazo, Afeta reputação e Full; nada quando o ML não informou ou disse não', () => {
    expect(selosExtrasML({ urgente: true, afetaReputacao: 'AFETA', ehFull: true }, prazo)).toEqual([
      { texto: 'Urgente · até 20/11', tom: 'erro' },
      { texto: 'Afeta reputação', tom: 'atencao' },
      { texto: 'Full', tom: 'destaque' },
    ]);
    expect(selosExtrasML({ urgente: true, afetaReputacao: null, ehFull: null }, null)).toEqual([{ texto: 'Urgente', tom: 'erro' }]);
    expect(selosExtrasML({ urgente: false, afetaReputacao: 'NAO_AFETA', ehFull: false }, prazo)).toEqual([]);
    expect(selosExtrasML({ urgente: null, afetaReputacao: 'NAO_SE_APLICA', ehFull: null }, prazo)).toEqual([]);
  });
});
