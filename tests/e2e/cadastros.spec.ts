import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('fiscal cadastra um fornecedor e um produto pelo formulário', async ({ page }, testInfo) => {
  // Cada projeto (computador e celular) usa um CNPJ válido e um SKU diferentes: o banco é o mesmo.
  const celular = ehCelular(testInfo);
  const cnpj = celular ? '01.122.233/0001-20' : '98.765.432/0001-98';
  const sufixo = celular ? 'C' : 'D';
  const razao = `Fornecedor Manual ${sufixo} Ltda`;

  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/cadastros/fornecedores');
  await semRolagemLateral(page);
  await page.getByRole('link', { name: 'Novo fornecedor' }).click();
  await page.getByLabel('Razão social (obrigatório)').fill(razao);
  await page.getByLabel('CNPJ (obrigatório)').fill(cnpj);
  await page.getByLabel('UF').selectOption('SP');
  await page.getByLabel('E-mail do SAC').fill('sac@manual.com.br');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(`Fornecedor ${razao} salvo.`);

  await page.getByRole('link', { name: 'Produtos', exact: true }).click();
  await page.getByRole('link', { name: 'Novo produto' }).click();
  await page.getByLabel('SKU (obrigatório)').fill(`manual-${sufixo}`);
  await page.getByLabel('Descrição (obrigatório)').fill('Carregador Manual');
  await page.getByLabel('Fornecedor', { exact: true }).selectOption({ label: razao });
  await page.getByLabel('Custo (R$)').fill('19,90');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(`Produto MANUAL-${sufixo} salvo.`);
  const cartao = page.getByRole('link', { name: new RegExp(`MANUAL-${sufixo}`) });
  await expect(cartao).toContainText('R$ 19,90');
  await expect(cartao).toContainText(razao);
  await semRolagemLateral(page);
});

test('um erro no formulário não apaga o que foi digitado', async ({ page }, testInfo) => {
  const sku = `DUP-${ehCelular(testInfo) ? 'C' : 'D'}`;
  await entrarComo(page, USUARIOS_E2E.fiscal);
  for (const vez of [1, 2]) {
    await page.goto('/cadastros/produtos/novo');
    await page.getByLabel('SKU (obrigatório)').fill(sku);
    await page.getByLabel('Descrição (obrigatório)').fill(`Tentativa ${vez}`);
    await page.getByRole('button', { name: 'Salvar' }).click();
    if (vez === 1) await expect(page.getByRole('status')).toHaveText(`Produto ${sku} salvo.`);
  }
  await expect(page.getByRole('alert').filter({ hasText: 'Já existe' })).toHaveText(`Já existe um produto com o SKU ${sku}`);
  await expect(page.getByRole('alert').filter({ hasText: 'Já existe' })).toBeFocused();
  await expect(page.getByLabel('Descrição (obrigatório)')).toHaveValue('Tentativa 2');
});
