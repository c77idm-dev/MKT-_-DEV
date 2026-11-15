import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { comBanco, entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { prepararFalha } from './apoio-acabamento';
import { USUARIOS_E2E } from './dados';

test('Gestor tenta de novo uma tarefa em Falhas e o worker a executa', async ({ page }) => {
  const { erro } = await prepararFalha({ tarefa: 'limpeza.temporarios', dados: {} });
  const antes = new Date();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/falhas');
  await expect(page.getByRole('heading', { name: 'Falhas', level: 1 })).toBeVisible();
  const cartao = page.getByRole('article').filter({ hasText: erro });
  await expect(cartao).toContainText('Limpeza de temporários');
  await semRolagemLateral(page);
  await cartao.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('#retorno-falhas')).toContainText('Tarefa "Limpeza de temporários" reenviada.');
  await expect(page.getByRole('article').filter({ hasText: erro })).toHaveCount(0);
  await expect
    .poll(
      () =>
        comBanco(async (db) => {
          const r = await db.execute<{ state: string }>(
            sql`select state from pgboss.job where name = 'limpeza.temporarios' and created_on >= ${antes.toISOString()}::timestamptz order by created_on desc limit 1`,
          );
          return r[0]?.state ?? null;
        }),
      { timeout: 30_000, intervals: [1000] },
    )
    .toBe('completed');
});

test('Gestor dispensa uma falha com dois toques', async ({ page }) => {
  const { erro } = await prepararFalha();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/falhas');
  const cartao = page.getByRole('article').filter({ hasText: erro });
  await cartao.getByRole('button', { name: 'Dispensar' }).click();
  await cartao.getByRole('button', { name: 'Toque de novo para dispensar' }).click();
  await expect(page.locator('#retorno-falhas')).toContainText('Falha dispensada.');
  await expect(page.getByRole('article').filter({ hasText: erro })).toHaveCount(0);
});

test('Fiscal e Operador não abrem Falhas', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, '/configuracoes/falhas');
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.operador);
  await paginaNaoEncontrada(page, '/configuracoes/falhas');
});
