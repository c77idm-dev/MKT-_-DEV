import { expect, test } from '@playwright/test';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirBusca, codigoUnico, comBanco, ehCelular, entrar, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

test('o quadro mostra a devolução nova na etapa 1 e a Busca Avançada do quadro acha pelo rastreio', async ({ page }, testInfo) => {
  const rastreio = codigoUnico('QF');
  const codigo = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return (await criarDevolucaoTeste(db, operador, { rastreio, canal: 'MAGALU' })).codigo;
  });
  await entrar(page, USUARIOS_E2E.fiscal);
  await expect(page).toHaveURL(/\/fluxo$/);
  await semRolagemLateral(page);

  if (ehCelular(testInfo)) {
    const etapas = page.getByRole('navigation', { name: 'Etapas' });
    const links = etapas.getByRole('link');
    await expect(links).toHaveCount(5);
    // Cada botão do seletor tem pelo menos 44 px de altura e de largura.
    for (const link of await links.all()) {
      const caixa = await link.boundingBox();
      expect(caixa?.height).toBeGreaterThanOrEqual(44);
      expect(caixa?.width).toBeGreaterThanOrEqual(44);
    }
    // Sem etapa na URL, abre a primeira etapa com devoluções (a 1, onde a devolução nova está).
    await expect(etapas.getByRole('link', { name: /^Pedidos Pendentes de Chegada: \d+ devoluç/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: new RegExp(codigo) }).first()).toBeVisible();

    await etapas.getByRole('link', { name: /^Pedidos Chegados - Aguardando Conferência/ }).click();
    await expect(page).toHaveURL(/\/fluxo\?etapa=2$/);
    await expect(page.getByRole('heading', { level: 2, name: '2. Pedidos Chegados - Aguardando Conferência' })).toBeVisible();
    await expect(etapas.getByRole('link', { name: /^Pedidos Chegados - Aguardando Conferência/ })).toHaveAttribute('aria-current', 'page');
    // Os cartões mudam: a devolução pendente da etapa 1 não aparece na etapa 2.
    await expect(page.getByRole('link', { name: new RegExp(codigo) })).toHaveCount(0);
    await semRolagemLateral(page);

    // Etapa 5: nota curta, sem aviso alarmante.
    await etapas.getByRole('link', { name: /^Agrupamento por Fornecedor/ }).click();
    await expect(page).toHaveURL(/\/fluxo\?etapa=5$/);
    await expect(page.getByText('Os lotes por fornecedor aparecem aqui quando a conferência estiver pronta.').locator('visible=true')).toHaveCount(1);
    await semRolagemLateral(page);

    // Etapa inválida na URL: não quebra e cai numa etapa válida.
    await page.goto('/fluxo?etapa=99');
    await expect(etapas.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Fluxo de devoluções' })).toBeVisible();
    await page.goto('/fluxo');
  } else {
    const colunas = page.locator('section[aria-labelledby^="coluna-"]');
    await expect(colunas).toHaveCount(5);
    const coluna = page.getByRole('region', { name: 'Pedidos Pendentes de Chegada' });
    await expect(coluna.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
    await expect(coluna).toContainText(/\d+ devoluç(ão|ões)/);
    await expect(page.getByRole('region', { name: 'Agrupamento por Fornecedor' })).toContainText('Os lotes por fornecedor aparecem aqui');
  }

  await abrirBusca(page);
  await page.getByRole('textbox', { name: 'Código de Rastreamento' }).fill(rastreio);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/fluxo\/busca\?/);
  await expect(page.getByRole('link', { name: new RegExp(codigo) })).toBeVisible();
  await expect(page.getByText('1 devolução', { exact: true })).toBeVisible();
});
