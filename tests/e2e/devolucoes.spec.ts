import { expect, test } from '@playwright/test';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirBusca, codigoUnico, comBanco, ehCelular, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

async function devolucaoPendente(): Promise<string> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio: codigoUnico('PD') })).codigo;
  });
}

test('operador cadastra uma devolução à mão e acha pela Busca Avançada', async ({ page }) => {
  const pedido = codigoUnico('PED');
  const rastreio = codigoUnico('BR');
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/1');
  await expect(page.getByRole('heading', { level: 1, name: 'Pedidos Pendentes de Chegada' })).toBeVisible();
  await semRolagemLateral(page);

  await page.getByRole('link', { name: 'Nova devolução' }).click();
  await page.getByLabel('Canal (obrigatório)').selectOption('SHOPEE');
  await page.getByLabel('Número do pedido (obrigatório)').fill(pedido);
  await page.getByLabel('Código de rastreamento').fill(rastreio.toLowerCase());
  await page.getByLabel('Transportadora').fill('Correios');
  await page.getByLabel('SKU do item 1').fill('fone-01');
  await page.getByLabel('quantidade do item 1').fill('2');
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await page.getByLabel('SKU do item 2').fill('CABO-02');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Cadastrar devolução' }).click();

  await expect(page).toHaveURL(/\/fluxo\/devolucoes\/DEV-\d{6}$/);
  const codigo = page.url().split('/').pop() ?? '';
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Itens (3 unidades)' })).toBeVisible();
  await expect(page.getByText('Devolução cadastrada')).toBeVisible();
  await expect(page.getByText(rastreio, { exact: true })).toBeVisible();
  await semRolagemLateral(page);

  await page.goto('/fluxo/etapa/1');
  await abrirBusca(page);
  await page.getByRole('textbox', { name: 'Código de Rastreamento' }).fill(rastreio.slice(2).toLowerCase());
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Remover filtro: Rastreio/ })).toBeVisible();

  await abrirBusca(page);
  await page.getByRole('textbox', { name: 'Código de Rastreamento' }).fill('');
  await page.getByRole('textbox', { name: 'Número do Pedido' }).fill(pedido);
  await page.getByRole('combobox', { name: 'Marketplace de Origem' }).selectOption('AMAZON');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Nenhuma devolução encontrada.')).toBeVisible();
});

test('gestor cancela uma devolução pendente e o histórico mostra o motivo', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await semRolagemLateral(page);
  await page.getByLabel('Cancelada').check();
  await page.getByLabel('Motivo').fill('Cliente desistiu da devolução');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Devolução cancelada')).toBeVisible();
  await expect(page.getByText('Motivo: Cliente desistiu da devolução')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar' })).toHaveCount(0);
});

test('o Fiscal vê o detalhe, sem as ações do Gestor, e não cadastra devolução (HTTP 404)', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar' })).toHaveCount(0);
  const resposta = await page.goto('/fluxo/devolucoes/nova');
  expect(resposta?.status()).toBe(404);
});

test.describe('mobile-first (celular)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!ehCelular(testInfo), 'só vale no celular (390×844)');
  });

  test('lista da etapa: Filtros recolhe a busca, a etiqueta remove o filtro e o resultado é em cartões', async ({ page }) => {
    const rastreio = codigoUnico('MB');
    await comBanco(async (db) => {
      const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
      await criarDevolucaoTeste(db, operador, { rastreio });
    });
    await entrarComo(page, USUARIOS_E2E.operador);
    await page.goto('/fluxo/etapa/1');

    const filtros = page.getByRole('button', { name: /^Filtros/ });
    const campo = page.getByRole('textbox', { name: 'Código de Rastreamento' });
    await expect(filtros).toBeVisible();
    await expect(filtros).toHaveAttribute('aria-expanded', 'false');
    await expect(campo).toBeHidden();
    await filtros.click();
    await expect(filtros).toHaveAttribute('aria-expanded', 'true');
    await expect(campo).toBeVisible();

    await campo.fill(rastreio.toLowerCase());
    await page.getByRole('button', { name: 'Buscar' }).click();
    const etiqueta = page.getByRole('link', { name: /^Remover filtro: Rastreio/ });
    await expect(etiqueta).toBeVisible();
    await expect(page.getByRole('list').getByRole('link').first()).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await semRolagemLateral(page);

    await etiqueta.click();
    await expect(page).not.toHaveURL(/rastreio=/);
    await expect(page.getByRole('link', { name: /^Remover filtro:/ })).toHaveCount(0);
    await semRolagemLateral(page);
  });

  test('nova devolução: uma coluna, botão no rodapé fixo à vista e erro com foco', async ({ page }) => {
    await entrarComo(page, USUARIOS_E2E.operador);
    await page.goto('/fluxo/devolucoes/nova');
    const enviar = page.getByRole('button', { name: 'Cadastrar devolução' });
    await expect(enviar).toBeInViewport();
    await semRolagemLateral(page);

    const esquerdas = await page
      .locator('form input[name="pedido"], form input[name="rastreio"], form select[name="canal"]')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(esquerdas).size, 'os campos ficam na mesma coluna').toBe(1);
    const alturas = await page
      .locator('form:has(button:text-is("Cadastrar devolução")) :is(input, select, button):visible')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    for (const altura of alturas) expect(altura).toBeGreaterThanOrEqual(44);

    // Itens sem SKU: o servidor recusa e a caixa de erros recebe o foco.
    await page.getByLabel('Canal (obrigatório)').selectOption('SHOPEE');
    await page.getByLabel('Número do pedido (obrigatório)').fill(codigoUnico('ERR'));
    await enviar.click();
    const erro = page.locator('#erros-formulario');
    await expect(erro).toContainText('Informe pelo menos um item');
    await expect(erro).toBeFocused();
    await expect(enviar).toBeInViewport();
  });
});
