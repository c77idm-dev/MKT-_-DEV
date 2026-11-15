import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { prepararLote } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('Fiscal separa uma unidade num lote novo de Troca, fecha o original como Conserto e reabre', async ({ page }) => {
  const lote = await prepararLote({ unidades: 2 });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/lotes/${lote.codigo}`);
  await expect(page.getByRole('heading', { name: lote.codigo, level: 1 })).toBeVisible();
  const retorno = page.locator('#retorno-lote');
  const unidades = page.getByRole('region', { name: 'Unidades' });
  await expect(unidades.getByRole('link', { name: /Ver evidências/ }).first()).toHaveAttribute('href', `/fluxo/devolucoes/${lote.devolucaoCodigo}#conferencia`);
  await semRolagemLateral(page);

  await unidades.getByRole('checkbox', { name: `Mover unidade 2 da ${lote.devolucaoCodigo}` }).check();
  await unidades.getByLabel('Para onde').selectOption({ label: 'Novo lote' });
  await unidades.getByLabel('Tipo do novo lote').selectOption({ label: 'Troca' });
  await unidades.getByRole('button', { name: 'Mover unidades' }).click();
  await expect(retorno).toContainText(/Unidades movidas para LOT-\d{6}\./);

  const fechar = page.getByRole('region', { name: 'Fechar lote' });
  await fechar.getByRole('radio', { name: 'Conserto' }).check();
  await fechar.getByRole('button', { name: 'Fechar lote' }).click();
  // O bloco "Fechar lote" some; a mensagem continua no topo (decisão 23).
  await expect(retorno).toContainText('Lote fechado.');
  await expect(page.getByRole('region', { name: 'Fechar lote' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reabrir lote' })).toBeVisible();

  await page.getByRole('button', { name: 'Reabrir lote' }).click();
  await expect(retorno).toContainText('Lote reaberto.');
  await expect(page.getByRole('region', { name: 'Fechar lote' })).toBeVisible();
  await semRolagemLateral(page);
});

test('Operador vê o lote sem nenhuma ação', async ({ page }) => {
  const lote = await prepararLote();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/lotes/${lote.codigo}`);
  await expect(page.getByRole('heading', { name: lote.codigo, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unidades' })).toContainText(lote.sku);
  await expect(page.getByRole('button', { name: /Fechar lote|Mover unidades|Reabrir lote|Emitir NF de Remessa|Registrar/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});
