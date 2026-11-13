import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, naFrente, semRolagemLateral } from './apoio';
import { devolucaoNoEstoque, prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

test('a coluna 4 se divide em Estoque Bom e Estoque Problema; a devolução com os dois destinos aparece nas duas abas', async ({ page }, testInfo) => {
  await prepararFiscal();
  const mista = await devolucaoNoEstoque({ destinos: ['BOM', 'PROBLEMA'] });
  const soProblema = await devolucaoNoEstoque({ destinos: ['PROBLEMA', 'AUSENTE'] });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(ehCelular(testInfo) ? '/fluxo?etapa=4' : '/fluxo');
  await expect(page.getByRole('link', { name: /^Estoque Bom: \d+ devoluç/ })).toBeVisible();
  await semRolagemLateral(page);
  if (ehCelular(testInfo)) {
    // Mobile-first (contrato §10, E5): a divisão fica no topo da etapa 4, antes do primeiro cartão.
    const etapa = page.getByRole('region', { name: /^4\. / });
    const divisao = await etapa.getByRole('navigation', { name: 'Estoque Bom e Estoque Problema' }).boundingBox();
    const primeiroCartao = await etapa.getByRole('listitem').first().boundingBox();
    expect(divisao !== null && primeiroCartao !== null && divisao.y < primeiroCartao.y).toBe(true);
  }

  await page.getByRole('link', { name: /^Estoque Problema: \d+ devoluç/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/etapa\/4\/problema$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Destinação Fiscal e Estoque' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Estoque Problema \(\d+\)$/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: new RegExp(mista.codigo) })).toContainText('Estoque Problema: 1');
  await expect(page.getByRole('link', { name: new RegExp(soProblema.codigo) })).toBeVisible();

  await page.getByRole('link', { name: /^Estoque Bom \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/etapa\/4$/);
  await expect(page.getByRole('link', { name: new RegExp(mista.codigo) })).toContainText('Estoque Bom: 1');
  await expect(page.getByRole('link', { name: new RegExp(soProblema.codigo) })).toHaveCount(0);
  // O Operador vê as listas, mas não emite NF (spec §6.9).
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Emitir NF/ })).toHaveCount(0);
  await semRolagemLateral(page);
});

test('o Fiscal seleciona e emite a NF de devolução; o worker autoriza e a devolução sai da etapa 4', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  const selecao = page.getByRole('checkbox', { name: `Selecionar ${dev.codigo}` });
  const alvo = await page.locator('label', { has: selecao }).boundingBox();
  expect(alvo?.height).toBeGreaterThanOrEqual(44);
  expect(alvo?.width).toBeGreaterThanOrEqual(44);
  await selecao.check();
  const emitir = page.getByRole('button', { name: 'Emitir NF de devolução (1)' });
  if (ehCelular(testInfo)) await naFrente(emitir);
  await emitir.click();
  await expect(page.getByRole('status')).toContainText(`Emissão enviada: ${dev.codigo}`);
  await expect(page.getByRole('checkbox', { name: `Selecionar ${dev.codigo}` })).toHaveCount(0);
  await semRolagemLateral(page);

  // O worker do e2e envia, consulta e autoriza (o falso autoriza na 2ª consulta, uns 10 s depois): a devolução fica Concluída.
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('link', { name: new RegExp(dev.codigo) }).count();
      },
      { timeout: 60_000, intervals: [3_000] },
    )
    .toBe(0);
});

test('sem a regra fiscal salva, a emissão é recusada (D13) e o erro recebe o foco', async ({ page }) => {
  await prepararFiscal({ semRegras: true });
  try {
    const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
    await entrarComo(page, USUARIOS_E2E.fiscal);
    await page.goto('/fluxo/etapa/4');
    await expect(page.getByRole('heading', { name: 'A emissão de NF está bloqueada' })).toBeVisible();
    await expect(page.getByText('Falta a regra fiscal: Devolução de venda, dentro do estado')).toBeVisible();
    await page.getByRole('checkbox', { name: `Selecionar ${dev.codigo}` }).check();
    await page.getByRole('button', { name: 'Emitir NF de devolução (1)' }).click();
    const erros = page.locator('#erros-emissao');
    await expect(erros).toHaveText(`${dev.codigo}: Falta a regra fiscal: Devolução de venda, dentro do estado`);
    await expect(erros).toBeFocused();
  } finally {
    await prepararFiscal();
  }
});

test('ZIP de um período sem notas: a etapa 4 explica em vez de baixar um arquivo vazio', async ({ page }) => {
  await prepararFiscal();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  const xmls = page.locator('details', { hasText: 'Baixar XMLs do período' });
  await xmls.getByText('Baixar XMLs do período').click();
  await xmls.getByLabel('De', { exact: true }).fill('2020-01-01');
  await xmls.getByLabel('Até', { exact: true }).fill('2020-01-31');
  await xmls.getByRole('button', { name: 'Baixar XMLs' }).click();
  await expect(page).toHaveURL(/\/fluxo\/etapa\/4\?xmls=vazio$/);
  await expect(page.getByRole('alert').filter({ hasText: 'Nenhum XML' })).toHaveText('Nenhum XML de NF autorizada ou cancelada nesse período.');
  await semRolagemLateral(page);
});
