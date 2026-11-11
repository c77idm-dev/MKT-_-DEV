import { describe, expect, it } from 'vitest';
import { aceitarNotificacaoML } from './notificacoes';

const AVISO = {
  id: 'abc',
  resource: '/post-purchase/v1/claims/5292183123',
  user_id: 123,
  topic: 'post_purchase',
  actions: ['claims'],
  application_id: 999,
  attempts: 1,
};

describe('aceitarNotificacaoML', () => {
  it('extrai tópico e recurso de um aviso válido', () => {
    expect(aceitarNotificacaoML(AVISO, '999')).toEqual({
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/5292183123',
      payload: AVISO,
    });
  });

  it('aceita qualquer app quando o client_id não está configurado', () => {
    expect(aceitarNotificacaoML(AVISO, undefined)?.topico).toBe('post_purchase');
  });

  it('ignora aviso de outro app', () => {
    expect(aceitarNotificacaoML(AVISO, '111')).toBeNull();
  });

  it('ignora corpo que não é objeto', () => {
    expect(aceitarNotificacaoML(null, undefined)).toBeNull();
    expect(aceitarNotificacaoML([AVISO], undefined)).toBeNull();
    expect(aceitarNotificacaoML('texto', undefined)).toBeNull();
  });

  it('guarda tópico e recurso nulos quando não vierem como texto', () => {
    expect(aceitarNotificacaoML({ outro: 1 }, undefined)).toEqual({ topico: null, recurso: null, payload: { outro: 1 } });
  });
});
