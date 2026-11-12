import { expect, test } from '@playwright/test';
import { semRolagemLateral } from './apoio';

test('o manifesto e os ícones PNG do app instalável respondem sem login', async ({ request }) => {
  const resposta = await request.get('/manifest.webmanifest');
  expect(resposta.ok()).toBe(true);
  expect(await resposta.json()).toMatchObject({
    name: 'Gestão de Devoluções',
    short_name: 'Devoluções',
    display: 'standalone',
    start_url: '/fluxo',
    theme_color: '#0F766E',
    background_color: '#F2F4F3',
  });
  for (const tamanho of [192, 512]) {
    const icone = await request.get(`/icones/${tamanho}`);
    expect(icone.ok()).toBe(true);
    expect(icone.headers()['content-type']).toBe('image/png');
  }
  expect((await request.get('/icones/64')).status()).toBe(404);
});

test('a tela de login cabe no celular e traz a cor do tema e o manifesto', async ({ page }) => {
  await page.goto('/login');
  await semRolagemLateral(page);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0F766E');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
});
