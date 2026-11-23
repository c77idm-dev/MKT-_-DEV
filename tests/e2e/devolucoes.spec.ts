import { expect, test, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import {
  abrirBusca,
  aguardarHidratacao,
  codigoUnico,
  comBanco,
  ehCelular,
  entrarComo,
  naFrente,
  paginaNaoEncontrada,
  semRolagemLateral,
  usuarioPorEmail,
} from './apoio';
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

async function statusNoBanco(codigo: string): Promise<string | undefined> {
  return comBanco(async (db) => {
    const [linha] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
    return linha?.status;
  });
}

/** Emenda E24: o cancelamento fica recolhido em "Mais ações do Gestor", fechado por padrão. */
function blocoMaisAcoes(page: Page): Locator {
  return page.locator('details', { hasText: 'Mais ações do Gestor' });
}

function pergunta(codigo: string): string {
  return `Tem certeza? A ${codigo} sai da espera de chegada e isso não se desfaz pela tela.`;
}

test('gestor cancela uma devolução pendente em "Mais ações do Gestor", confirma, e o histórico mostra o motivo', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const bloco = blocoMaisAcoes(page);
  const resumo = bloco.getByText('Mais ações do Gestor');

  // Fechado por padrão: nada do cancelamento à vista, e o resumo é um alvo de toque de 44 px ou mais.
  await expect(resumo).toBeVisible();
  await expect(bloco).not.toHaveAttribute('open');
  await expect(page.getByRole('radio', { name: 'Cancelada' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^(Escolha uma opção|Cancelar devolução|Registrar)$/ })).toBeHidden();
  expect((await resumo.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);

  await resumo.click();
  await expect(bloco).toHaveAttribute('open', '');
  await expect(bloco.getByRole('heading', { name: 'Cancelar ou marcar como extraviada' })).toBeVisible();
  await expect(bloco.getByText(/Para registrar a chegada do pacote, use Receber pacote no Fluxo\. \(extra\)/)).toBeVisible();
  await expect(bloco.getByRole('link', { name: 'Ir para Receber pacote' })).toHaveAttribute('href', '/fluxo/recebimento');
  // Nenhuma opção marcada; o botão é neutro até a escolha e, sem ela, avisa em português.
  await expect(page.getByRole('radio', { name: 'Cancelada' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'Extraviada' })).not.toBeChecked();
  const escolha = bloco.getByRole('button', { name: 'Escolha uma opção' });
  await aguardarHidratacao(escolha);
  await page.getByLabel('Motivo').fill('Cliente desistiu da devolução');
  await escolha.click();
  await expect(bloco.getByRole('alert')).toHaveText('Escolha se a devolução foi cancelada ou extraviada.');
  await expect(page.getByRole('radio', { name: 'Cancelada' })).toBeFocused();

  await page.getByRole('radio', { name: 'Cancelada' }).check();
  await expect(bloco.getByRole('alert')).toHaveCount(0);
  await bloco.getByRole('button', { name: 'Cancelar devolução' }).click();
  // O 1º toque só pergunta (com o foco na pergunta); nada mudou ainda.
  await expect(bloco.getByText(pergunta(codigo))).toBeFocused();
  const sim = bloco.getByRole('button', { name: 'Sim, cancelar devolução' });
  await naFrente(sim);
  await semRolagemLateral(page);
  const alturas = await bloco
    .locator(':is(summary, label:has(input[type="radio"]), a, button):visible')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const altura of alturas) expect(altura, 'alvo de toque de 44 px ou mais').toBeGreaterThanOrEqual(44);
  expect(await statusNoBanco(codigo)).toBe('PENDENTE_CHEGADA');

  await sim.click();
  await expect(page.getByRole('status')).toHaveText('Devolução cancelada.');
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByRole('link', { name: '← Fluxo' })).toBeVisible();
  await expect(page.getByText('Pendente de chegada → Cancelada')).toBeVisible();
  await expect(page.getByText('Motivo: Cliente desistiu da devolução')).toBeVisible();
  await expect(page.getByText('Mais ações do Gestor')).toHaveCount(0);
  expect(await statusNoBanco(codigo)).toBe('CANCELADA');
});

test('gestor marca como extraviada: "Voltar" não envia, e só o "Sim" muda o status', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const bloco = blocoMaisAcoes(page);
  await bloco.getByText('Mais ações do Gestor').click();
  await aguardarHidratacao(bloco.getByRole('button', { name: 'Escolha uma opção' }));
  await page.getByRole('radio', { name: 'Extraviada' }).check();
  await page.getByLabel('Motivo').fill('Correios confirmaram o extravio');
  const marcar = bloco.getByRole('button', { name: 'Marcar como extraviada' });
  await marcar.click();
  await expect(bloco.getByText(pergunta(codigo))).toBeFocused();

  await bloco.getByRole('button', { name: 'Voltar' }).click();
  await expect(bloco.getByRole('button', { name: 'Sim, marcar como extraviada' })).toHaveCount(0);
  await expect(marcar).toBeFocused();
  expect(await statusNoBanco(codigo)).toBe('PENDENTE_CHEGADA');

  await marcar.click();
  await bloco.getByRole('button', { name: 'Sim, marcar como extraviada' }).click();
  await expect(page.getByRole('status')).toHaveText('Devolução marcada como extraviada.');
  await expect(page.getByText('Pendente de chegada → Extraviada')).toBeVisible();
  await expect(page.getByText('Motivo: Correios confirmaram o extravio')).toBeVisible();
  await semRolagemLateral(page);
  expect(await statusNoBanco(codigo)).toBe('EXTRAVIADA');
});

test('o Operador vê o detalhe da pendente sem "Mais ações do Gestor"', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible();
  await expect(page.getByText('Mais ações do Gestor')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Cancelada' })).toHaveCount(0);
});

test('o Fiscal vê o detalhe, sem as ações do Gestor, e não cadastra devolução (HTTP 404)', async ({ page }) => {
  const codigo = await devolucaoPendente();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await expect(page.getByRole('heading', { level: 1, name: codigo })).toBeVisible();
  await expect(page.getByText('Mais ações do Gestor')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Cancelada' })).toHaveCount(0);
  await paginaNaoEncontrada(page, '/fluxo/devolucoes/nova');
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
    await expect(page.getByRole('list').getByRole('link', { name: /DEV-\d{6}/ }).first()).toBeVisible();
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
    await naFrente(enviar);
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
    await naFrente(enviar);
  });
});

test('a etapa 6 não existe (HTTP 404) e a etapa 5 mostra a lista de lotes', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await paginaNaoEncontrada(page, '/fluxo/etapa/6');
  await page.goto('/fluxo/etapa/5');
  await expect(page.getByRole('heading', { name: 'Agrupamento por Fornecedor (Remessas)', level: 1 })).toBeVisible();
  await semRolagemLateral(page);
});
