import { randomUUID } from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarDbTeste, urlBancoTeste } from '../../../tests/helpers/db';
import { criarFilas, criarPgBoss, enviarPorPgBoss, idDoJob } from './fila';

// Schema próprio: não mistura com o pg-boss do e2e nem com o de outro teste.
const SCHEMA = 'pgboss_fila_int';
const { db, sql } = criarDbTeste();
let boss: PgBoss;

beforeAll(async () => {
  boss = criarPgBoss(urlBancoTeste(), { max: 3, supervisionar: false, schema: SCHEMA });
  await boss.start();
  await criarFilas(boss);
  await boss.deleteAllJobs();
}, 60_000);
afterAll(async () => {
  await boss.stop({ graceful: false });
  await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await sql.end();
});

async function jobs(nome: 'midia.processar-foto', chave: string) {
  return boss.findJobs<{ evidenciaId: string }>(nome, { id: idDoJob(nome, chave) });
}

describe('fila no pg-boss', () => {
  it('o envio dentro da transação some no rollback e aparece no commit', async () => {
    const chave = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { tx, chaveUnica: chave });
        throw new Error('desfaz');
      }),
    ).rejects.toThrow('desfaz');
    expect(await jobs('midia.processar-foto', chave)).toHaveLength(0);

    await db.transaction(async (tx) => {
      await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { tx, chaveUnica: chave });
    });
    const achados = await jobs('midia.processar-foto', chave);
    expect(achados).toHaveLength(1);
    expect(achados[0].data).toEqual({ evidenciaId: chave });
  });

  it('chaveUnica: o segundo envio com a mesma chave é ignorado', async () => {
    const chave = randomUUID();
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { chaveUnica: chave });
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { chaveUnica: chave });
    expect(await jobs('midia.processar-foto', chave)).toHaveLength(1);
  });

  it('iniciarEm deixa a tarefa para depois', async () => {
    const chave = randomUUID();
    const depois = new Date(Date.now() + 60 * 60 * 1000);
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: chave }, { chaveUnica: chave, iniciarEm: depois });
    const [job] = await jobs('midia.processar-foto', chave);
    expect(job.startAfter.getTime()).toBeGreaterThanOrEqual(depois.getTime() - 1000);
  });

  it('as filas nascem com as tentativas e o prazo do contrato', async () => {
    expect(await boss.getQueue('midia.transcodificar')).toMatchObject({ retryLimit: 4, expireInSeconds: 3600 });
    expect(await boss.getQueue('ml.enviar-resultado')).toMatchObject({ retryLimit: 4, expireInSeconds: 300 });
  });
});
