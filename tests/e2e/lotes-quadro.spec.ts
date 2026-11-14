import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { prepararLote } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('a coluna 5 do quadro mostra os lotes por fornecedor e a devolução mostra o seu lote', async ({ page }, testInfo) => {
  const lote = await prepararLote({ unidades: 1 });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(ehCelular(testInfo) ? '/fluxo?etapa=5' : '/fluxo');
  const cartao = page.getByRole('link', { name: new RegExp(`^${lote.codigo}`) }).first();
  await expect(cartao).toContainText(lote.fornecedor);
  await semRolagemLateral(page);
  await cartao.click();
  await expect(page.getByRole('heading', { name: lote.codigo, level: 1 })).toBeVisible();

  await page.goto(`/fluxo/devolucoes/${lote.devolucaoCodigo}`);
  const secao = page.getByRole('region', { name: 'Lote' });
  await expect(secao.getByRole('link', { name: new RegExp(lote.codigo) })).toHaveAttribute('href', `/lotes/${lote.codigo}`);
  await expect(secao).toContainText('Em lote');
  await semRolagemLateral(page);
});
