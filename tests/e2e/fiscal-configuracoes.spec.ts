import { expect, test } from '@playwright/test';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { limparFiscal, prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

// As configurações são uma linha só no banco: cada teste deixa tudo pronto para os próximos specs.
test.afterEach(async () => {
  await prepararFiscal();
});

test('Gestor preenche os dados da empresa e salva a regra sugerida; o erro recebe o foco', async ({ page }) => {
  await limparFiscal();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes');
  // O cartão "Fiscal" é da Parte A; o seletor pelo endereço não depende do texto do cartão.
  await page.locator('a[href="/configuracoes/fiscal"]').first().click();
  await expect(page).toHaveURL(/\/configuracoes\/fiscal$/);
  await expect(page.getByRole('heading', { name: 'A emissão de NF está bloqueada' })).toBeVisible();
  await semRolagemLateral(page);

  await page.getByLabel('Razão social').fill('Empresa Teste Ltda');
  await page.getByLabel('CNPJ').fill('11.444.777/0001-62');
  await page.getByLabel('Inscrição estadual').fill('110042490114');
  await page.getByLabel('CEP').fill('01001-000');
  await page.getByLabel('Logradouro').fill('Rua A');
  await page.getByLabel('Número', { exact: true }).fill('100');
  await page.getByLabel('Bairro').fill('Centro');
  await page.getByLabel('Cidade').fill('Sao Paulo');
  await page.getByLabel('UF', { exact: true }).selectOption('SP');
  await page.getByRole('radio', { name: 'Simples Nacional' }).check();
  await page.getByLabel('Série da NF-e').fill('1');
  await page.getByRole('button', { name: 'Salvar dados da empresa' }).click();
  const erros = page.locator('#erros-formulario');
  await expect(erros).toHaveText('CNPJ inválido');
  await expect(erros).toBeFocused();

  await page.getByLabel('CNPJ').fill('11.444.777/0001-61');
  await page.getByRole('button', { name: 'Salvar dados da empresa' }).click();
  await expect(page.getByRole('status')).toHaveText('Dados da empresa salvos.');
  await expect(page.getByText('Falta a regra fiscal: Devolução de venda, dentro do estado')).toBeVisible();

  const regra = page.getByRole('link', { name: /^Devolução de venda, dentro do estado/ });
  await expect(regra).toContainText('Sugestão, ainda não salva');
  await regra.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Regra fiscal: Devolução de venda, dentro do estado' })).toBeVisible();
  await expect(page.getByLabel('CFOP')).toHaveValue('1202');
  await expect(page.getByLabel('CSOSN do ICMS')).toHaveValue('900');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Salvar regra' }).click();
  await expect(page.getByRole('status')).toHaveText('Regra fiscal salva.');
  await expect(page.getByRole('link', { name: /^Devolução de venda, dentro do estado/ })).toContainText('Salva');
});

test('Gestor só passa para produção com a confirmação do contador e volta para homologação', async ({ page }) => {
  await prepararFiscal();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/fiscal');
  const formulario = page.getByRole('form', { name: 'Trocar o ambiente da NF-e' });
  await formulario.getByRole('radio', { name: 'Produção' }).check();
  await formulario.getByRole('button', { name: 'Salvar ambiente' }).click();
  const erros = page.locator('#erros-ambiente');
  await expect(erros).toHaveText('Para passar para produção, confirme que o contador validou as regras e as notas de homologação.');
  await expect(erros).toBeFocused();

  await formulario.getByRole('checkbox', { name: /O contador validou/ }).check();
  await formulario.getByRole('button', { name: 'Salvar ambiente' }).click();
  await expect(page.getByRole('status')).toHaveText('Ambiente da NF-e alterado.');
  await expect(page.locator('dd', { hasText: /^Produção$/ })).toBeVisible();

  await page.getByRole('form', { name: 'Trocar o ambiente da NF-e' }).getByRole('radio', { name: 'Homologação (sem valor fiscal)' }).check();
  await page.getByRole('form', { name: 'Trocar o ambiente da NF-e' }).getByRole('button', { name: 'Salvar ambiente' }).click();
  await expect(page.locator('dd', { hasText: /^Homologação \(sem valor fiscal\)$/ })).toBeVisible();
});

test('o Fiscal vê as configurações fiscais sem poder alterar', async ({ page }) => {
  await prepararFiscal();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/configuracoes/fiscal');
  await expect(page.getByText('Só o Gestor altera estas configurações.')).toBeVisible();
  await expect(page.getByText('Empresa Teste Ltda')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Salvar/ })).toHaveCount(0);
  await semRolagemLateral(page);

  await page.getByRole('link', { name: /^Devolução de venda, dentro do estado/ }).click();
  await expect(page.getByText('1202', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar regra' })).toHaveCount(0);
  await paginaNaoEncontrada(page, '/configuracoes');
});

test('o Operador não entra nas configurações fiscais', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await paginaNaoEncontrada(page, '/configuracoes/fiscal');
});
