import { describe, expect, it } from 'vitest';
import { aceitarNotificacaoML, LIMITE_AVISO_BYTES, lerAvisoML } from './notificacoes';

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
    expect(aceitarNotificacaoML({ outro: 1 }, undefined)).toEqual({ topico: null, recurso: null, payload: {} });
  });

  it('descarta campos desconhecidos do payload', () => {
    const r = aceitarNotificacaoML({ ...AVISO, extra: 'x'.repeat(10) }, undefined);
    expect(r?.payload).toEqual(AVISO);
    expect(r?.payload).not.toHaveProperty('extra');
  });
});

describe('lerAvisoML', () => {
  it('aceita JSON válido', () => {
    expect(lerAvisoML(JSON.stringify(AVISO))).toEqual({ ok: true, corpo: AVISO });
  });

  it('responde 400 para JSON inválido', () => {
    expect(lerAvisoML('{nao json')).toEqual({ ok: false, status: 400 });
  });

  it('responde 413 acima de 64 KB', () => {
    expect(LIMITE_AVISO_BYTES).toBe(64 * 1024);
    expect(lerAvisoML('"' + 'x'.repeat(LIMITE_AVISO_BYTES) + '"')).toEqual({ ok: false, status: 413 });
  });
});
