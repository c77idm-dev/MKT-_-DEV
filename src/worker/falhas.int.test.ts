import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { falhasTarefas } from '@/db/schema';
import { FILA_FALHAS } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas, urlBancoTeste } from '../../tests/helpers/db';
import { iniciarWorker } from './index';

const SCHEMA = 'pgboss_falhas_int';
const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(async () => {
  await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await sql.end();
});

const opcoes = { url: urlBancoTeste(), schema: SCHEMA, intervaloSegundos: 0.5, registrar: () => {} };

describe('Falhas (spec §11): a tarefa que esgota as 5 tentativas vai para falhas_tarefas', () => {
  it('toda fila aponta para a fila de falhas', async () => {
    const worker = await iniciarWorker({ ...opcoes, manipuladores: {} });
    try {
      expect(await worker.boss.getQueue(FILA_FALHAS)).not.toBeNull();
      expect((await worker.boss.getQueue('nfe.emitir'))?.deadLetter).toBe(FILA_FALHAS);
      expect((await worker.boss.getQueue('midia.retencao'))?.deadLetter).toBe(FILA_FALHAS);
    } finally {
      await worker.parar();
    }
  }, 60_000);

  it('grava a tarefa, os dados, o motivo e as tentativas', async () => {
    const worker = await iniciarWorker({
      ...opcoes,
      manipuladores: {
        'ml.enviar-resultado': async () => {
          throw new Error('ML fora do ar');
        },
      },
    });
    try {
      // Sem espera entre as tentativas, só neste teste.
      await worker.boss.updateQueue('ml.enviar-resultado', { retryDelay: 0, retryBackoff: false });
      const devolucaoId = randomUUID();
      await worker.boss.send('ml.enviar-resultado', { devolucaoId });
      await expect.poll(async () => (await db.select().from(falhasTarefas)).length, { timeout: 45_000, interval: 500 }).toBe(1);
      const [f] = await db.select().from(falhasTarefas);
      expect(f).toMatchObject({ tarefa: 'ml.enviar-resultado', dados: { devolucaoId }, erro: 'ML fora do ar', tentativas: 5, ocorrencias: 1, situacao: 'ABERTA' });
    } finally {
      await worker.parar();
    }
  }, 60_000);

  it('a tarefa que estoura o tempo também vai para Falhas, com "Tempo esgotado"', async () => {
    const worker = await iniciarWorker({
      ...opcoes,
      // O pg-boss 12.38.0 confere o tempo na supervisão e no monitor (60 s por padrão); aqui, a cada 1 s (o mínimo).
      intervaloSupervisaoSegundos: 1,
      manipuladores: {
        'midia.retencao': () => new Promise<void>((ok) => setTimeout(ok, 10_000)),
      },
    });
    try {
      // Uma tentativa só, de 1 s, só neste teste.
      await worker.boss.updateQueue('midia.retencao', { retryLimit: 0, expireInSeconds: 1 });
      await worker.boss.send('midia.retencao', {});
      await expect.poll(async () => (await db.select().from(falhasTarefas)).length, { timeout: 60_000, interval: 500 }).toBe(1);
      const [f] = await db.select().from(falhasTarefas);
      expect(f).toMatchObject({ tarefa: 'midia.retencao', erro: 'Tempo esgotado', situacao: 'ABERTA' });
    } finally {
      await worker.parar();
    }
  }, 90_000);
});
