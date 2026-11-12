import { expect, test } from '@playwright/test';
import { entrarComo } from './apoio';
import { USUARIOS_E2E } from './dados';

test('operador não abre Produtos e Fornecedores (HTTP 404)', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  const resposta = await page.goto('/cadastros/produtos');
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});

test('fiscal usa a barra de abas para chegar aos cadastros e não abre Contestações ML (HTTP 404)', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link')).toHaveText(['Fluxo', 'Lotes e Remessas', 'Produtos e Fornecedores']);
  await nav.getByRole('link', { name: 'Produtos e Fornecedores' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Produtos e Fornecedores' })).toBeVisible();
  const resposta = await page.goto('/contestacoes');
  expect(resposta?.status()).toBe(404);
});
