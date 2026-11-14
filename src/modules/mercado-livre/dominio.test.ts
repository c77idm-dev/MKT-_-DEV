import { describe, expect, it } from 'vitest';
import { motivoCanalML, rotuloStatusML, sincronizacaoAtrasada } from './dominio';

describe('motivoCanalML (spec §7.4, contrato §5.4)', () => {
  it.each([
    ['AVARIADO', 'SRF2'],
    ['INCOMPLETO', 'SRF3'],
    ['DIVERGENTE', 'SRF4'],
    ['AUSENTE', 'SRF5'],
    ['USADO', 'SRF6'],
    ['COM_DEFEITO', 'SRF6'],
    ['OUTRO', 'SRF6'],
  ] as const)('%s → %s', (motivo, canal) => {
    expect(motivoCanalML(motivo)).toBe(canal);
  });
});

describe('sincronizacaoAtrasada (spec §11: alerta depois de 1 hora)', () => {
  const agora = new Date('2026-11-12T12:00:00Z');
  it('sem nenhuma sincronização conta como atrasada', () => {
    expect(sincronizacaoAtrasada(null, agora)).toBe(true);
  });
  it('59 minutos não é atraso; 61 minutos é', () => {
    expect(sincronizacaoAtrasada(new Date('2026-11-12T11:01:00Z'), agora)).toBe(false);
    expect(sincronizacaoAtrasada(new Date('2026-11-12T10:59:00Z'), agora)).toBe(true);
  });
});

describe('rotuloStatusML', () => {
  it('traduz o status da devolução no ML (a parte antes da barra)', () => {
    expect(rotuloStatusML('shipped/shipped')).toBe('A caminho');
    expect(rotuloStatusML('delivered/delivered')).toBe('Entregue');
    expect(rotuloStatusML('cancelled')).toBe('Cancelada no ML');
  });
  it('mostra o valor bruto quando não conhece, e um traço quando não há', () => {
    expect(rotuloStatusML('status_novo/x')).toBe('status_novo');
    expect(rotuloStatusML(null)).toBe('—');
  });
});
