import { expect, test } from '@playwright/test';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { prepararLote, prepararSemFornecedor } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('Fiscal vê os lotes, filtra por status, busca e associa o produto de uma unidade sem fornecedor', async ({ page }) => {
  const lote = await prepararLote({ status: 'FECHADO', unidades: 2 });
  const pendente = await prepararSemFornecedor();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/lotes');
  await expect(page.getByRole('heading', { name: 'Lotes e Remessas', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Sem fornecedor: \d+/ })).toBeVisible();
  await page.getByLabel('Status').selectOption('FECHADO');
  await page.getByLabel('Buscar').fill(lote.devolucaoCodigo);
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/status=FECHADO/);
  const cartao = page.getByRole('link', { name: new RegExp(`^${lote.codigo}`) });
  await expect(cartao).toContainText(lote.fornecedor);
  await expect(cartao).toContainText('2 unidades');
  await semRolagemLateral(page);

  // O banco do e2e é compartilhado: a unidade nova pode não estar entre as 5 da página; a lista inteira tem todas.
  await page.goto('/lotes/sem-fornecedor');
  const pendencias = page.getByRole('region', { name: /^Sem fornecedor/ });
  const campo = pendencias.getByLabel(`SKU do produto recebido (unidade 1 da ${pendente.devolucaoCodigo})`);
  await campo.fill(pendente.skuParaAssociar);
  await campo.locator('xpath=ancestor::form').getByRole('button', { name: 'Associar produto' }).click();
  await expect(page.locator('#retorno-sem-fornecedor')).toContainText(new RegExp(`Unidade 1 da ${pendente.devolucaoCodigo} incluída no lote LOT-[0-9]{6}`));
  await expect(pendencias.getByLabel(`SKU do produto recebido (unidade 1 da ${pendente.devolucaoCodigo})`)).toHaveCount(0);
  await semRolagemLateral(page);
});

test('Operador vê a etapa 5 (só leitura) e não abre a aba Lotes e Remessas', async ({ page }) => {
  const lote = await prepararLote();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/5');
  await expect(page.getByRole('heading', { name: 'Agrupamento por Fornecedor (Remessas)', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`^${lote.codigo}`) })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Sem fornecedor/ })).toHaveCount(0);
  await semRolagemLateral(page);
  await paginaNaoEncontrada(page, '/lotes');
  await paginaNaoEncontrada(page, '/lotes/sem-fornecedor');
});
