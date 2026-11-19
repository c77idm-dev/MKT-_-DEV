import { describe, expect, it } from 'vitest';
import {
  AFETA_REPUTACAO_DO_ML,
  CONDICAO_TRIAGEM_DO_ML,
  DINHEIRO_DO_ML,
  motivoCanalML,
  ROTULO_AFETA_REPUTACAO,
  ROTULO_CONDICAO_TRIAGEM,
  ROTULO_DINHEIRO,
  rotuloAcaoML,
  rotuloEtapaTriagem,
  rotuloStatusML,
  SELO_AFETA_REPUTACAO,
  SELO_FULL,
  SELO_URGENTE,
  sincronizacaoAtrasada,
} from './dominio';

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

describe('extras do ML (integração Bitbrain §4.5)', () => {
  it('traduz os valores do ML e tem rótulo em português para cada um', () => {
    expect(AFETA_REPUTACAO_DO_ML).toEqual({ affected: 'AFETA', not_affected: 'NAO_AFETA', not_applies: 'NAO_SE_APLICA' });
    expect(CONDICAO_TRIAGEM_DO_ML).toEqual({ saleable: 'VENDAVEL', unsaleable: 'NAO_VENDAVEL', discard: 'DESCARTE', missing: 'FALTANDO' });
    expect(DINHEIRO_DO_ML).toEqual({ retained: 'RETIDO', refunded: 'DEVOLVIDO', available: 'LIBERADO' });
    expect(ROTULO_CONDICAO_TRIAGEM.NAO_VENDAVEL).toBe('Não vendável');
    expect(ROTULO_DINHEIRO.RETIDO).toBe('retido');
    expect(ROTULO_AFETA_REPUTACAO.AFETA).toBe('Afeta a reputação');
    expect([SELO_URGENTE, SELO_AFETA_REPUTACAO, SELO_FULL]).toEqual(['Urgente', 'Afeta reputação', 'Full']);
  });

  it('rótulos de ação e de etapa da triagem: conhecidos em português, desconhecidos crus, nulo → traço/nulo', () => {
    expect(rotuloAcaoML('return_review_fail')).toBe('Revisar a devolução');
    expect(rotuloAcaoML('acao_nova')).toBe('acao_nova');
    expect(rotuloAcaoML(null)).toBe('—');
    expect(rotuloEtapaTriagem('closed')).toBe('concluída');
    expect(rotuloEtapaTriagem('outra')).toBe('outra');
    expect(rotuloEtapaTriagem(null)).toBeNull();
  });
});
