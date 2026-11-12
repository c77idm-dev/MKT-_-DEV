import { expect, test } from '@playwright/test';
import { criarDevolucaoTeste, criarFornecedorTeste, criarProdutoTeste } from '../helpers/fabricas';
import { codigoUnico, comBanco, ehCelular, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

// Palavras longas sem espaço (e-mail de SAC, descrição colada, código) não podem alargar a página no celular.
test.beforeEach(({}, testInfo) => {
  test.skip(!ehCelular(testInfo), 'só no celular');
});

test('dados longos não fazem a página rolar para o lado no celular', async ({ page }) => {
  const marca = codigoUnico('LG');
  const emailLongo = `atendimento-sac-do-fornecedor-com-nome-muito-longo-${marca.toLowerCase()}@dominio-extremamente-comprido-de-exemplo.com.br`;
  const descricaoLonga = `ProdutoComDescricaoSemEspacosQueNaoTerminaNuncaEContinuaPorMuitoTempo${marca}`;
  const skuLongo = `SKU-MUITO-LONGO-${marca}`;
  const codigoLongo = `CODIGO${'0123456789'.repeat(8)}`;
  expect(emailLongo.length).toBeGreaterThan(70);
  expect(descricaoLonga.length).toBeGreaterThan(60);

  const devolucao = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    await criarFornecedorTeste(db, { razaoSocial: `Fornecedor ${marca}`, cnpj: '45723174000110', emailSac: emailLongo });
    await criarProdutoTeste(db, { sku: skuLongo, descricao: descricaoLonga });
    return criarDevolucaoTeste(db, operador, { rastreio: marca, itens: [{ sku: skuLongo, quantidade: 1 }] });
  });

  await entrarComo(page, USUARIOS_E2E.gestor);

  await page.goto(`/cadastros/fornecedores?busca=${marca}`);
  await expect(page.getByText(emailLongo)).toBeVisible();
  await semRolagemLateral(page);

  await page.goto(`/cadastros/produtos?busca=${skuLongo}`);
  await expect(page.getByText(descricaoLonga).first()).toBeVisible();
  await semRolagemLateral(page);

  await page.goto(`/fluxo/devolucoes/${devolucao.codigo}`);
  await expect(page.getByText(descricaoLonga).first()).toBeVisible();
  await semRolagemLateral(page);

  await page.goto(`/fluxo/etapa/1?rastreio=${marca}`);
  await expect(page.getByRole('link', { name: new RegExp(devolucao.codigo) })).toBeVisible();
  await semRolagemLateral(page);

  await page.goto(`/fluxo/etapa/1?codigo=${codigoLongo}`);
  await expect(page.getByRole('link', { name: /^Remover filtro: Código/ })).toBeVisible();
  await semRolagemLateral(page);
  // a barra de abas fixa continua dentro da tela
  const barra = page.getByRole('navigation', { name: 'Seções' });
  if (await barra.count()) {
    const caixa = await barra.boundingBox();
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
});
