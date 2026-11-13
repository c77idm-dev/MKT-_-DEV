import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { criarDbTeste, urlBancoTeste } from '../../tests/helpers/db';
import { iniciarWorker } from './index';

const SCHEMA = 'pgboss_worker_int';
const { sql } = criarDbTeste();
afterAll(async () => {
  await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await sql.end();
});

describe('iniciarWorker (pg-boss de verdade)', () => {
  it('roda o manipulador com os dados enviados', async () => {
    const recebidos: unknown[] = [];
    const worker = await iniciarWorker({
      url: urlBancoTeste(),
      schema: SCHEMA,
      intervaloSegundos: 0.5,
      registrar: () => {},
      manipuladores: {
        'midia.processar-foto': async (dados) => {
          recebidos.push(dados);
        },
      },
    });
    try {
      const evidenciaId = randomUUID();
      await worker.boss.send('midia.processar-foto', { evidenciaId });
      await expect.poll(() => recebidos, { timeout: 20_000, interval: 250 }).toEqual([{ evidenciaId }]);
    } finally {
      await worker.parar();
    }
  }, 60_000);

  it('uma tarefa que sempre falha roda 5 vezes e termina como falha (spec §11: retryLimit 4)', async () => {
    const tentativas: number[] = [];
    const worker = await iniciarWorker({
      url: urlBancoTeste(),
      schema: SCHEMA,
      intervaloSegundos: 0.5,
      registrar: () => {},
      manipuladores: {
        'limpeza.temporarios': async (_dados, ctx) => {
          tentativas.push(ctx.tentativa);
          throw new Error('falha de teste');
        },
      },
    });
    try {
      // Sem espera entre as tentativas, só neste teste.
      await worker.boss.updateQueue('limpeza.temporarios', { retryDelay: 0, retryBackoff: false });
      const id = randomUUID();
      await worker.boss.send('limpeza.temporarios', {}, { id });
      await expect
        .poll(async () => (await worker.boss.findJobs('limpeza.temporarios', { id }))[0]?.state, { timeout: 40_000, interval: 500 })
        .toBe('failed');
      expect(tentativas).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await worker.parar();
    }
  }, 60_000);
});
