import { expect, test } from '@playwright/test';
import { contasBitbrain } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { semContasBitbrain } from './apoio-bitbrain';
import { alvosDeToque44 } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test.beforeEach(async () => {
  await semContasBitbrain();
});

test('gestor vê as contas do Bitbrain, marca uma e pede "Sincronizar agora"', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeVisible();
  await expect(page.getByText('Modo de teste: o sistema usa um Bitbrain falso.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Conectar conta do Mercado Livre/ })).toHaveCount(0);
  const loja1 = page.getByRole('article', { name: 'Loja Falsa 1' });
  const loja2 = page.getByRole('article', { name: 'Loja Falsa 2' });
  await expect(loja1.getByText('Não recebe', { exact: true })).toBeVisible();
  await expect(loja2.getByText('Não recebe', { exact: true })).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));

  await loja1.getByRole('button', { name: 'Receber devoluções' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A conta passa a mandar devoluções para a bancada.' })).toBeVisible();
  await expect(loja1.getByText('Recebe devoluções', { exact: true })).toBeVisible();
  await expect(loja1.getByText('Ainda não sincronizou')).toBeVisible();

  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronização pedida.' })).toBeVisible();
  // O worker do e2e (modo bitbrain) varre a conta marcada e grava a última sincronização.
  await expect
    .poll(
      async () => {
        await page.reload();
        return loja1.getByText('Ainda não sincronizou').count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(0);
  await expect(loja2.getByText('Não recebe', { exact: true })).toBeVisible();
  await semRolagemLateral(page);
});

test('conta que sumiu do Bitbrain fica "Indisponível no Bitbrain"; "Atualizar contas" responde', async ({ page }) => {
  await comBanco(async (db) => {
    await db.insert(contasBitbrain).values({ empresa: 'loja-antiga', nome: 'Loja Antiga', sellerId: '999', recebeDevolucoes: true });
  });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await expect(page.getByRole('article', { name: 'Loja Antiga' }).getByText('Indisponível no Bitbrain')).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar contas' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lista de contas atualizada: 2 contas no Bitbrain.' })).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(page.locator('main'));
});
