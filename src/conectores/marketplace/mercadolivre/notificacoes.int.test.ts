import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notificacoesRecebidas } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../../tests/helpers/db';
import { registrarNotificacao } from './notificacoes';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('registrarNotificacao', () => {
  it('grava o aviso com canal, tópico, recurso e corpo', async () => {
    const id = await registrarNotificacao(db, 'mercado_livre', {
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/1',
      payload: { topic: 'post_purchase', resource: '/post-purchase/v1/claims/1' },
    });

    const [linha] = await db.select().from(notificacoesRecebidas);
    expect(linha.id).toBe(id);
    expect(linha).toMatchObject({
      canal: 'mercado_livre',
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/1',
      payload: { topic: 'post_purchase', resource: '/post-purchase/v1/claims/1' },
      processadaEm: null,
    });
  });
});
