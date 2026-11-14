import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('a página "Sem conexão" abre sem login e cabe no celular', async ({ page }) => {
  await page.goto('/offline');
  await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
  await semRolagemLateral(page);
});

test('depois de abrir a bancada uma vez, sem internet a navegação mostra "Sem conexão"', async ({ page, context }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/conferencia');
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          return navigator.serviceWorker.controller !== null;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.goto('/fluxo/conferencia');
  const guardados = await page.evaluate(async () => (await (await caches.open('devolucoes-v2')).keys()).map((r) => new URL(r.url).pathname));
  expect(guardados.some((c) => c.startsWith('/_next/static/'))).toBe(true);
  expect(guardados.filter((c) => c.startsWith('/api/'))).toEqual([]);
  await context.setOffline(true);
  try {
    await page.goto('/fluxo');
    await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
