import { existsSync, readFileSync, statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ARQUIVO_BATIMENTO, batimentoRecente } from '../../src/worker/batimento';

test('/api/saude confere o banco e a fila', async ({ request }) => {
  const resposta = await request.get('/api/saude');
  expect(resposta.status()).toBe(200);
  expect(await resposta.json()).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
});

test('o worker do e2e está no ar', async () => {
  const log = () => {
    try {
      return readFileSync('.dados-e2e/worker.log', 'utf8');
    } catch {
      return '';
    }
  };
  await expect.poll(log, { timeout: 30_000 }).toContain('worker iniciado');
});

test('/api/saude nunca fica em cache (decisão 16)', async ({ request }) => {
  expect((await request.get('/api/saude')).headers()['cache-control']).toBe('no-store');
});

test('o worker do e2e grava o batimento do healthcheck (decisão 17)', async () => {
  // A pasta temporária é a mesma para todas as worktrees deste PC: um arquivo velho de outro worker não vale.
  // Exige uma gravação feita DEPOIS do início do teste (o worker grava a cada 30 s).
  const inicio = Date.now();
  await expect
    .poll(() => (existsSync(ARQUIVO_BATIMENTO) ? statSync(ARQUIVO_BATIMENTO).mtimeMs : 0), { timeout: 60_000, intervals: [1000] })
    .toBeGreaterThan(inicio);
  expect(batimentoRecente(ARQUIVO_BATIMENTO, Date.now())).toBe(true);
});
