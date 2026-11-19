import { expect, test } from '@playwright/test';
import { abrirMenuAcoes, ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

const ACOES = [
  { rotulo: 'Receber pacote', quando: 'Chegou um pacote na bancada' },
  { rotulo: 'Nova devolução', quando: 'Vai chegar uma devolução' },
  { rotulo: 'Retiradas do Full', quando: 'Voltou do armazém do ML' },
  { rotulo: 'Planilha Volta ao armazém', quando: 'Ver o que volta para venda' },
];

test('Operador: "O que você quer fazer?" mostra as 4 ações, fecha com Esc e "Receber pacote" leva ao Recebimento (opção C)', async ({
  page,
}, testInfo) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  const gatilho = page.getByRole('button', { name: 'O que você quer fazer?' });
  expect((await gatilho.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // As 4 entradas antigas não ficam mais soltas no topo.
  for (const nome of ['Recebimento', 'Retiradas do Full', 'Planilha Volta ao armazém']) {
    await expect(page.getByRole('link', { name: nome, exact: true })).toHaveCount(0);
  }

  const menu = await abrirMenuAcoes(page);
  const links = menu.getByRole('link');
  await expect(links).toHaveCount(ACOES.length);
  for (const [i, acao] of ACOES.entries()) {
    const link = links.nth(i);
    await expect(link).toHaveAccessibleName(acao.rotulo);
    await expect(link).toHaveAccessibleDescription(acao.quando);
    await expect(link).toContainText(acao.quando);
    await expect(link).toBeInViewport();
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const fechar = menu.getByRole('button', { name: 'Fechar' });
  expect((await fechar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await semRolagemLateral(page);
  const caixa = (await menu.boundingBox())!;
  const tela = page.viewportSize()!;
  if (ehCelular(testInfo)) {
    // Folha presa embaixo, na largura toda.
    await expect.poll(async () => Math.round(((await menu.boundingBox())?.y ?? 0) + caixa.height)).toBe(tela.height);
    expect(Math.round(caixa.width)).toBe(tela.width);
  } else {
    expect(caixa.width).toBeLessThanOrEqual(420);
  }

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(gatilho).toBeFocused();

  // O toque no fundo, fora do painel, também fecha.
  await abrirMenuAcoes(page);
  await page.mouse.click(10, 10);
  await expect(menu).toBeHidden();

  await abrirMenuAcoes(page);
  await menu.getByRole('link', { name: 'Receber pacote' }).click();
  await expect(page).toHaveURL(/\/fluxo\/recebimento$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Recebimento' })).toBeVisible();
});
