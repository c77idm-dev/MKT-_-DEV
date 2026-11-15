import { expect, test } from '@playwright/test';
import { aguardarHidratacao, ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('login com a faixa da marca, sem rolagem lateral', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Devoluções', { exact: true })).toBeVisible();
  await expect(page.getByText('Recebimento, conferência, NF e remessas num só lugar.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
  // Faixa de código de barras (mockup "C"): no topo da faixa verde, acima do título.
  const legenda = page.getByText('DEV · CONFERÊNCIA · NF', { exact: true });
  await expect(legenda).toBeVisible();
  const yLegenda = (await legenda.boundingBox())!.y;
  const yTitulo = (await page.getByText('Devoluções', { exact: true }).boundingBox())!.y;
  expect(yLegenda).toBeLessThan(yTitulo);
  await semRolagemLateral(page);

  const caixa = await page.getByRole('button', { name: 'Entrar' }).boundingBox();
  expect(caixa!.height).toBeGreaterThanOrEqual(44);
});

test('Ver mostra a senha digitada', async ({ page }) => {
  await page.goto('/login');
  const senha = page.getByLabel('Senha');
  await aguardarHidratacao(senha);
  await senha.fill('abc123');
  await page.getByRole('button', { name: 'Ver' }).click();
  await expect(senha).toHaveAttribute('type', 'text');
});

test('lembra o e-mail na próxima visita', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('E-mail')).toHaveValue(USUARIOS_E2E.operador.email);
  await expect(page.getByLabel('Senha')).toBeFocused();
});

test('computador estreito: o formulário não fica espremido', async ({ page }, testInfo) => {
  test.skip(ehCelular(testInfo), 'só no computador');
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/login');
  const caixa = await page.getByLabel('E-mail').boundingBox();
  expect(caixa!.width).toBeGreaterThanOrEqual(280);
  await semRolagemLateral(page);
});
