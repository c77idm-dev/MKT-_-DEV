import { describe, expect, it } from 'vitest';
import { encerradaNoML, proximoStatusML, statusDaDevolucaoML, type SituacaoML } from './status';

const aoVendedor = (statusCanal: string): SituacaoML => ({ statusCanal, destinoEnvio: 'VENDEDOR', reenvioDaTriagem: false });

describe('proximoStatusML (spec §7.3)', () => {
  it.each(['pending', 'label_generated', 'scheduled', 'shipped', 'pending_delivered', 'delivered'])('%s: continua Pendente de chegada', (s) => {
    expect(proximoStatusML('PENDENTE_CHEGADA', aoVendedor(`${s}/${s}`))).toBeNull();
  });

  it.each(['cancelled', 'pending_cancel', 'expired', 'pending_expiration', 'return_to_buyer'])('%s → CANCELADA', (s) => {
    expect(proximoStatusML('PENDENTE_CHEGADA', aoVendedor(s))).toBe('CANCELADA');
  });

  it.each(['not_delivered', 'failed', 'pending_failure'])('%s → EXTRAVIADA', (s) => {
    expect(proximoStatusML('PENDENTE_CHEGADA', aoVendedor(`${s}/not_delivered`))).toBe('EXTRAVIADA');
  });

  it('envio ao CD do ML → NO_CD_MARKETPLACE; o reenvio da triagem volta a Pendente de chegada', () => {
    expect(proximoStatusML('PENDENTE_CHEGADA', { statusCanal: 'delivered/delivered', destinoEnvio: 'CD_MARKETPLACE', reenvioDaTriagem: false })).toBe(
      'NO_CD_MARKETPLACE',
    );
    expect(proximoStatusML('NO_CD_MARKETPLACE', { statusCanal: 'shipped/shipped', destinoEnvio: 'VENDEDOR', reenvioDaTriagem: true })).toBe(
      'PENDENTE_CHEGADA',
    );
    expect(proximoStatusML('NO_CD_MARKETPLACE', { statusCanal: 'delivered/delivered', destinoEnvio: 'CD_MARKETPLACE', reenvioDaTriagem: false })).toBeNull();
  });

  it('depois da chegada física o status do ML não muda o do sistema', () => {
    for (const atual of ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF', 'CONCLUIDA'] as const) {
      expect(proximoStatusML(atual, aoVendedor('cancelled'))).toBeNull();
    }
  });

  it('no CD do ML, cancelamento não muda o status (a tabela da spec §5.2 não tem essa linha)', () => {
    expect(proximoStatusML('NO_CD_MARKETPLACE', aoVendedor('cancelled'))).toBeNull();
  });
});

describe('statusDaDevolucaoML e encerradaNoML', () => {
  it('lê a parte antes da barra', () => {
    expect(statusDaDevolucaoML('shipped/delivered')).toBe('shipped');
    expect(statusDaDevolucaoML('closed')).toBe('closed');
  });

  it('diz se o ML encerrou a devolução', () => {
    expect(encerradaNoML(aoVendedor('expired'))).toBe('CANCELADA');
    expect(encerradaNoML(aoVendedor('failed/not_delivered'))).toBe('EXTRAVIADA');
    expect(encerradaNoML(aoVendedor('shipped/shipped'))).toBeNull();
  });
});
