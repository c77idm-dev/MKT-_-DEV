import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
