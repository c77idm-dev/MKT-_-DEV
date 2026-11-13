import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notificacoesRecebidas } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { marcarNotificacoesProcessadas, receberNotificacaoML } from './notificacoes';

const { db, sql } = criarDbTeste();
let fila: FilaMemoria;
beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
});
afterAll(async () => {
  await sql.end();
});

const aviso = (recurso: string, vendedor: unknown = 123456789) => ({
  topico: 'post_purchase',
  recurso,
  payload: { resource: recurso, user_id: vendedor, topic: 'post_purchase' },
});

describe('receberNotificacaoML (spec §7.2)', () => {
  it('grava o aviso com a referência e enfileira a sincronização quando o vendedor está conectado', async () => {
    await contaMLTeste(db);
    const r = await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/5292183123'));
    expect(r.enfileirada).toBe(true);
    const [linha] = await db.select().from(notificacoesRecebidas);
    expect(linha).toMatchObject({
      id: r.id,
      canal: 'mercado_livre',
      topico: 'post_purchase',
      recurso: '/post-purchase/v1/claims/5292183123',
      referenciaExterna: '5292183123',
      processadaEm: null,
    });
    expect(fila.enviadas).toEqual([
      {
        nome: 'ml.sincronizar-reclamacao',
        dados: { claimId: '5292183123' },
        opcoes: expect.objectContaining({ chaveUnica: expect.stringMatching(/^ml-reclamacao-5292183123-\d+$/) }),
      },
    ]);
  });

  it('vendedor desconhecido, sem conta, ou recurso que não é reclamação: grava e não enfileira', async () => {
    expect((await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/1'))).enfileirada).toBe(false);
    await contaMLTeste(db);
    expect((await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/2', 999))).enfileirada).toBe(false);
    expect((await receberNotificacaoML(db, fila, aviso('/orders/3'))).enfileirada).toBe(false);
    expect(await db.select().from(notificacoesRecebidas)).toHaveLength(3);
    expect(fila.enviadas).toEqual([]);
  });
});

describe('marcarNotificacoesProcessadas', () => {
  it('marca só os avisos ainda abertos daquela reclamação', async () => {
    await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/1'));
    await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/1'));
    await receberNotificacaoML(db, fila, aviso('/post-purchase/v1/claims/2'));
    const agora = new Date('2026-11-12T15:00:00Z');
    expect(await marcarNotificacoesProcessadas(db, '1', agora)).toBe(2);
    expect(await marcarNotificacoesProcessadas(db, '1', agora)).toBe(0);
    const linhas = await db.select().from(notificacoesRecebidas);
    expect(linhas.filter((l) => l.processadaEm !== null).map((l) => l.referenciaExterna)).toEqual(['1', '1']);
  });
});
