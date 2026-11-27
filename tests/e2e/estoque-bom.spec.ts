import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { readSheet } from 'read-excel-file/universal';
import { hojeEmBrasilia } from '../../src/modules/volta-armazem/dominio';
import { criarProdutoTeste } from '../helpers/fabricas';
import { criarDevolucaoNoEstoqueTeste } from '../helpers/fabricas-fiscal';
import { criarRetiradaTeste } from '../helpers/fabricas-retiradas';
import { paraArrayBuffer } from '../helpers/xlsx';
import { abrirMenuAcoes, codigoUnico, comBanco, ehCelular, entrarComo, naFrente, semRolagemLateral, usuarioPorEmail } from './apoio';
import { URL_E2E, USUARIOS_E2E } from './dados';

/** Uma unidade BOM (e uma AUSENTE, que não entra) e uma retirada do Full Conferida com 2 unidades, hoje. SKUs únicos. */
async function prepararVolta() {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const skuDev = codigoUnico('SKUV');
    const skuRet = codigoUnico('SKUR');
    await criarProdutoTeste(db, { sku: skuDev, descricao: 'Fone que voltou' });
    const produtoRet = await criarProdutoTeste(db, { sku: skuRet, descricao: 'Carregador do Full' });
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      // 2 s atrás: a conferência fica estritamente antes da retirada (datas no mesmo milissegundo deixavam a ordem ao acaso).
      agora: new Date(Date.now() - 2000),
      unidades: [
        { sku: skuDev, destino: 'BOM', serial: 'SN-VOLTA' },
        { sku: skuDev, destino: 'AUSENTE' },
      ],
    });
    const ret = await criarRetiradaTeste(db, gestor, { concluidaEm: new Date(), itens: [{ produtoId: produtoRet, quantidade: 2 }] });
    return { skuDev, skuRet, dev: dev.codigo, ret: ret.codigo };
  });
}

test('Estoque Bom: abre pela etapa 4, filtra Hoje, mostra a unidade e o item da retirada e baixa a planilha (melhoria 4)', async ({ page }, testInfo) => {
  const dados = await prepararVolta();
  // (E29) A planilha é de quem acompanha (Fiscal e Gestor).
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  await page.getByRole('link', { name: 'Planilha Volta ao armazém' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Estoque Bom' })).toBeVisible();
  await page.getByRole('link', { name: 'Hoje', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Hoje', exact: true })).toHaveAttribute('aria-current', 'true');

  const unidade = page.getByRole('article').filter({ hasText: dados.skuDev });
  await expect(unidade).toHaveCount(1); // a AUSENTE não entra
  await expect(unidade).toContainText('Fone que voltou');
  await expect(unidade).toContainText('Aguardando NF');
  await expect(unidade).toContainText('Quantidade: 1');
  await expect(unidade.getByRole('link', { name: dados.dev })).toHaveAttribute('href', `/fluxo/devolucoes/${dados.dev}`);

  const item = page.getByRole('article').filter({ hasText: dados.skuRet });
  await expect(item).toContainText('Carregador do Full');
  await expect(item).toContainText('Retirada do Full');
  await expect(item).toContainText('Quantidade: 2');
  await expect(item.getByRole('link', { name: dados.ret })).toHaveAttribute('href', `/fluxo/retiradas-full/${dados.ret}`);
  // Os cartões vêm do mais recente para o mais antigo: a retirada foi concluída depois da conferência.
  const textos = await page.getByRole('article').allTextContents();
  expect(textos.findIndex((t) => t.includes(dados.skuRet))).toBeLessThan(textos.findIndex((t) => t.includes(dados.skuDev)));

  const baixar = page.getByRole('link', { name: 'Baixar planilha' });
  expect((await baixar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // No celular o botão fica fixo acima da barra de abas: tem de estar na frente sem rolar. No computador ele vem no fim
  // da lista, e a lista de "Hoje" cresce com as unidades que os outros specs deixam no Estoque Bom: rola até ele antes.
  if (!ehCelular(testInfo)) await baixar.scrollIntoViewIfNeeded();
  await naFrente(baixar);
  await semRolagemLateral(page);
  // Prints para a revisão visual (só com PRINTS_DIR): o topo e o fim da lista, com o rodapé fixo.
  if (process.env.PRINTS_DIR) {
    await page.screenshot({ path: join(process.env.PRINTS_DIR, `estoque-bom-${test.info().project.name}.png`) });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.screenshot({ path: join(process.env.PRINTS_DIR, `estoque-bom-${test.info().project.name}-fim.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  const download = page.waitForEvent('download');
  await baixar.click();
  const arquivo = await download;
  const hoje = hojeEmBrasilia();
  expect(arquivo.suggestedFilename()).toBe(`volta-ao-armazem_${hoje}_a_${hoje}.xlsx`);
  const linhas = await readSheet(paraArrayBuffer(await readFile(await arquivo.path())));
  const [ano, mes, dia] = hoje.split('-');
  expect(linhas[1].slice(0, 2)).toEqual(['Período', `${dia}/${mes}/${ano} a ${dia}/${mes}/${ano}`]);
  expect(linhas[3]).toEqual(['Data', 'Origem', 'SKU', 'Descrição', 'EAN', 'Quantidade', 'Situação', 'Nº de série']);
  const daUnidade = linhas.find((l) => l[2] === dados.skuDev);
  expect(daUnidade?.slice(1)).toEqual([dados.dev, dados.skuDev, 'Fone que voltou', null, 1, 'Aguardando NF', 'SN-VOLTA']);
  const doItem = linhas.find((l) => l[2] === dados.skuRet);
  expect(doItem?.slice(1)).toEqual([dados.ret, dados.skuRet, 'Carregador do Full', null, 2, 'Retirada do Full', null]);
});

test('Estoque Bom: período inválido mostra o alerta com o foco e não oferece a planilha', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/estoque-bom?de=2026-11-17&ate=2026-11-16');
  // O anúncio de rota do Next também é role="alert": filtra pelo texto.
  const alerta = page.getByRole('alert').filter({ hasText: 'Período inválido' });
  await expect(alerta).toHaveText('Período inválido: escolha "De" antes de "Até", com no máximo 366 dias.');
  await expect(alerta).toBeFocused();
  await expect(page.getByRole('link', { name: 'Baixar planilha' })).toHaveCount(0);
  await semRolagemLateral(page);
});

test('Estoque Bom: o Painel leva à página e, sem sessão ou com o Operador (E29), a planilha não baixa', async ({ page, browser }) => {
  // (E29) O Operador não tem a planilha: a página leva à Bancada e o download responde "não encontrada".
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/estoque-bom');
  await expect(page).toHaveURL(/\/bancada$/);
  const doOperador = await page.request.get('/api/estoque-bom/planilha', { maxRedirects: 0 });
  expect(doOperador.status()).toBe(404);
  expect(doOperador.headers()['content-disposition']).toBeUndefined();
  await page.context().clearCookies();

  await entrarComo(page, USUARIOS_E2E.gestor);
  const menu = await abrirMenuAcoes(page);
  await menu.getByRole('link', { name: 'Planilha Volta ao armazém' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Estoque Bom' })).toBeVisible();

  const anonimo = await browser.newContext({ baseURL: URL_E2E });
  try {
    const resposta = await anonimo.request.get('/api/estoque-bom/planilha', { maxRedirects: 0 });
    expect(resposta.status()).not.toBe(200);
    expect(resposta.headers()['location'] ?? '').toContain('/login');
    expect(resposta.headers()['content-disposition']).toBeUndefined();
  } finally {
    await anonimo.close();
  }
});
