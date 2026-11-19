import { describe, expect, it } from 'vitest';
import { alertasDoPerfil, backupAtrasado, DEFINICAO_ALERTA, diasUteisDepois, discoQuaseCheio, prazoVencendo } from './alertas-regras';

const h = (iso: string) => new Date(iso);

describe('alertas do painel (spec §6.0.1)', () => {
  it('títulos da spec', () => {
    expect(DEFINICAO_ALERTA.prazo_ml.titulo).toBe('Prazo do ML vencendo');
    expect(DEFINICAO_ALERTA.nf_rejeitada.titulo).toBe('NF rejeitada');
    expect(DEFINICAO_ALERTA.sincronizacao_ml.titulo).toBe('Sincronização com o ML parada há mais de 1 h');
    expect(DEFINICAO_ALERTA.sem_fornecedor.titulo).toBe('Itens sem fornecedor');
    expect(DEFINICAO_ALERTA.entregue_sem_leitura.titulo).toBe('Entregue (ML) sem leitura física');
  });

  it('cada perfil vê só os seus (decisão 9)', () => {
    expect(alertasDoPerfil('OPERADOR')).toEqual(['prazo_ml', 'entregue_sem_leitura']);
    expect(alertasDoPerfil('FISCAL')).toEqual(['nf_rejeitada', 'sem_fornecedor', 'lote_nf_cancelada']);
    expect(alertasDoPerfil('GESTOR')).toHaveLength(13);
  });
});

describe('alertas do modo Bitbrain', () => {
  it('alertas do modo Bitbrain (D10): títulos e links', () => {
    expect(DEFINICAO_ALERTA.respostas_ml).toMatchObject({ titulo: 'Respostas para dar no ML', perfis: ['GESTOR'], href: '/contestacoes' });
    expect(DEFINICAO_ALERTA.conta_bitbrain_indisponivel).toMatchObject({ titulo: 'Conta do ML indisponível no Bitbrain', perfis: ['GESTOR'] });
    expect(alertasDoPerfil('GESTOR').slice(0, 2)).toEqual(['prazo_ml', 'respostas_ml']);
  });
});

describe('prazoVencendo (decisão 11)', () => {
  const agora = h('2026-11-17T12:00:00Z');
  it('até 24 h ou vencido', () => {
    expect(prazoVencendo(h('2026-11-18T11:00:00Z'), agora)).toBe(true);
    expect(prazoVencendo(h('2026-11-16T12:00:00Z'), agora)).toBe(true);
    expect(prazoVencendo(h('2026-11-18T13:00:00Z'), agora)).toBe(false);
  });
});

describe('diasUteisDepois (decisão 12, fuso de Brasília)', () => {
  // 13/11/2026 é sexta-feira.
  it('entregue na sexta: segunda = 1, terça = 2; o fim de semana não conta', () => {
    const sexta = h('2026-11-13T13:00:00Z');
    expect(diasUteisDepois(sexta, h('2026-11-14T15:00:00Z'))).toBe(0);
    expect(diasUteisDepois(sexta, h('2026-11-16T15:00:00Z'))).toBe(1);
    expect(diasUteisDepois(sexta, h('2026-11-17T11:00:00Z'))).toBe(2);
  });
  it('o dia é o de Brasília: 23h30 de sexta ainda é sexta', () => {
    expect(diasUteisDepois(h('2026-11-14T02:30:00Z'), h('2026-11-17T11:00:00Z'))).toBe(2);
  });
  it('entregue no sábado: terça = 2', () => {
    expect(diasUteisDepois(h('2026-11-14T15:00:00Z'), h('2026-11-17T15:00:00Z'))).toBe(2);
  });
});

describe('disco e backup (extras, decisão 21)', () => {
  it('disco: mais de 85% em uso', () => {
    expect(discoQuaseCheio({ totalBytes: 100, livreBytes: 14 })).toBe(true);
    expect(discoQuaseCheio({ totalBytes: 100, livreBytes: 15 })).toBe(false);
  });
  it('backup: atrasado sem OK em 26 h, só depois do primeiro registro', () => {
    const agora = h('2026-11-20T12:00:00Z');
    expect(backupAtrasado(null, false, agora)).toBe(false);
    expect(backupAtrasado(null, true, agora)).toBe(true);
    expect(backupAtrasado(h('2026-11-19T09:00:00Z'), true, agora)).toBe(true);
    expect(backupAtrasado(h('2026-11-19T11:00:00Z'), true, agora)).toBe(false);
  });
});
