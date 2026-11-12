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

/** O banco é o mesmo nos dois projetos (computador e celular): cada um importa dados próprios. */
function planilhasDoProjeto(celular: boolean) {
  const c = celular
    ? { cnpjA: '33.344.455/0001-83', cnpjB: '44.455.566/0001-83', skuA: 'FONE-C1', skuB: 'CABO-C2', skuErro: 'ERRO-C3', eanA: '7891000000038', eanB: '7891000000045', eanRuim: '7891000000198' }
    : { cnpjA: '11.222.333/0001-81', cnpjB: '12.345.678/0001-95', skuA: 'FONE-01', skuB: 'CABO-02', skuErro: 'ERRO-03', eanA: '7891000000014', eanB: '7891000000021', eanRuim: '7891000000099' };
  const soDigitos = (v: string) => v.replace(/\D/g, '');
  const sufixo = celular ? 'C' : 'D';
  const fornecedores = [
    'Razão Social;CNPJ;UF;E-mail SAC',
    `Fornecedor Alfa ${sufixo} Ltda;${c.cnpjA};SP;sac@alfa.com.br`,
    `Fornecedor Beta ${sufixo} SA;${c.cnpjB};MG;`,
  ].join('\r\n');
  const produtos = [
    'Código;GTIN;Nome do produto;CNPJ Fornecedor;Preço de custo;Und',
    `${c.skuA};${c.eanA};Fone Bluetooth;${soDigitos(c.cnpjA)};89,90;UN`,
    `${c.skuB};${c.eanB};Cabo USB-C;${soDigitos(c.cnpjB)};12,50;UN`,
    `${c.skuErro};${c.eanRuim};Produto com EAN errado;;10,00;UN`,
  ].join('\r\n');
  return { c, fornecedores, produtos };
}

test('fiscal importa fornecedores e produtos por planilha, ajustando uma coluna à mão', async ({ page }, testInfo) => {
  const celular = ehCelular(testInfo);
  const { c, fornecedores, produtos } = planilhasDoProjeto(celular);
  await entrarComo(page, USUARIOS_E2E.fiscal);

  await page.goto('/cadastros/fornecedores');
  await page.getByRole('link', { name: 'Importar planilha' }).click();
  await page.getByLabel('Planilha').setInputFiles({ name: 'fornecedores.csv', mimeType: 'text/csv', buffer: Buffer.from(fornecedores) });
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  await expect(page.getByRole('heading', { name: '2. Prévia' })).toBeVisible();
  await expect(page.getByText(/2 linhas prontas/)).toBeVisible();
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status')).toContainText('Fornecedores novos: 2');

  await page.goto('/importacoes/produtos');
  await page.getByLabel('Planilha').setInputFiles({ name: 'produtos.csv', mimeType: 'text/csv', buffer: Buffer.from(produtos) });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  await expect(page.getByLabel('SKU (obrigatório)')).toHaveValue('Código');
  await expect(page.getByLabel('Unidade')).toHaveValue('');

  // Mobile-first: um bloco por campo, rótulo acima de um select de largura total e pelo menos 44 px de altura.
  const selectUnidade = page.getByLabel('Unidade');
  const caixa = await selectUnidade.boundingBox();
  const rotulo = await page.locator('label[for="campo-unidade"]').boundingBox();
  expect(caixa!.height).toBeGreaterThanOrEqual(44);
  expect(rotulo!.y + rotulo!.height).toBeLessThanOrEqual(caixa!.y + 1);
  if (celular) {
    const secao = await page.getByRole('region', { name: '1. Colunas da planilha' }).boundingBox();
    expect(caixa!.width).toBeGreaterThan(secao!.width * 0.8);
  }

  await selectUnidade.selectOption('Und');
  await page.getByRole('button', { name: 'Atualizar prévia' }).click();
  await expect(page.getByLabel('Unidade')).toHaveValue('Und');
  await expect(page.getByText(`EAN inválido: ${c.eanRuim}`)).toBeVisible();
  await expect(page.getByText(/2 linhas prontas/)).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await semRolagemLateral(page);

  const confirmar = page.getByRole('button', { name: 'Confirmar importação' });
  if (celular) {
    // O botão fica preso acima da barra de abas, visível sem rolar até o fim.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(confirmar).toBeInViewport();
  }
  await confirmar.click();
  await expect(page.getByRole('status')).toContainText('Produtos novos: 2');
  await expect(page.getByRole('status')).toContainText('Linhas com erro (ignoradas): 1 (linha 4)');

  await page.goto(`/cadastros/produtos?busca=${c.skuA}`);
  await page.getByRole('link', { name: new RegExp(`^Editar ${c.skuA}`) }).click();
  await page.getByLabel('Descrição (obrigatório)').fill('Fone Bluetooth Preto');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`^Editar ${c.skuA}`) })).toContainText('Fone Bluetooth Preto');
});

test('planilha acima de 5 MB é recusada com mensagem clara', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/importacoes/fornecedores');
  const grande = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
  await page.getByLabel('Planilha').setInputFiles({ name: 'grande.csv', mimeType: 'text/csv', buffer: grande });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  const alerta = page.getByRole('alert').filter({ hasText: '5 MB' });
  await expect(alerta).toHaveText('A planilha passa de 5 MB. Divida o arquivo.');
  await expect(alerta).toBeFocused();
});

test('trocar uma coluna atualiza a prévia sozinho e a confirmação usa a coluna nova', async ({ page }, testInfo) => {
  const sufixo = ehCelular(testInfo) ? 'C' : 'D';
  const sku = `AUTO-${sufixo}1`;
  const csv = ['Código;Nome do produto;Preço de custo', `${sku};Produto Auto ${sufixo};45,00`].join('\r\n');
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/importacoes/produtos');
  await page.getByLabel('Planilha').setInputFiles({ name: 'auto.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  await expect(page.getByLabel('Custo')).toHaveValue('Preço de custo');
  const valorNaPrevia = page.locator('dd', { hasText: '45,00' });
  await expect(valorNaPrevia).toBeVisible();

  // Sem tocar em "Atualizar prévia": a troca da coluna atualiza a prévia e o botão espera.
  await page.getByLabel('Custo').selectOption('');
  await expect(valorNaPrevia).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByRole('status')).toContainText('Produtos novos: 1');

  await page.goto(`/cadastros/produtos?busca=${sku}`);
  const cartao = page.getByRole('link', { name: new RegExp(`^Editar ${sku}`) });
  await expect(cartao).toBeVisible();
  await expect(cartao).not.toContainText('R$');
});

test('planilha acima de 6 MB também recebe a mensagem clara de 5 MB', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/importacoes/fornecedores');
  await page.getByLabel('Planilha').setInputFiles({ name: 'enorme.csv', mimeType: 'text/csv', buffer: Buffer.alloc(6.5 * 1024 * 1024, 'a') });
  await page.getByRole('button', { name: 'Enviar planilha' }).click();
  const alerta = page.getByRole('alert').filter({ hasText: '5 MB' });
  await expect(alerta).toHaveText('A planilha passa de 5 MB. Divida o arquivo.');
  await expect(alerta).toBeFocused();
});
