import { describe, expect, it } from 'vitest';
import { responderSaude } from './resposta';

describe('responderSaude (spec §11; decisão 16)', () => {
  it('200 quando banco e fila respondem, sempre sem cache', async () => {
    const r = await responderSaude(async () => ({ status: 'ok', banco: 'ok', fila: 'ok' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
  });
  it('503 quando um deles falha', async () => {
    const r = await responderSaude(async () => ({ status: 'erro', banco: 'ok', fila: 'falhou' }));
    expect(r.status).toBe(503);
  });
  it('503 quando a própria verificação lança (ex.: variável de ambiente inválida)', async () => {
    const r = await responderSaude(async () => {
      throw new Error('Variáveis de ambiente inválidas: DATABASE_URL');
    });
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ status: 'erro', banco: 'falhou', fila: 'falhou' });
  });
});
