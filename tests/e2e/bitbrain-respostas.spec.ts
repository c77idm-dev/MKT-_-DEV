import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { fotoProntaSemArquivo, okPendentePronto } from './apoio-bitbrain';
import { alvosDeToque44, contestacaoPronta } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('contestação no modo Bitbrain: "Responda no ML", Copiar, fotos para baixar e "Marcar como respondida"', async ({ page }) => {
  const { id, codigo } = await contestacaoPronta({ cenario: 1, motivo: 'AVARIADO' });
  const devolucaoId = await comBanco(async (db) => (await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.codigo, codigo)))[0].id);
  await fotoProntaSemArquivo(devolucaoId);

  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/contestacoes/${id}`);
  const bloco = page.locator('section[aria-labelledby="titulo-responda"]');
  await expect(bloco.getByRole('heading', { name: 'Responda no ML' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar ao ML' })).toHaveCount(0);
  await expect(bloco.getByText('SRF2', { exact: true })).toBeVisible();
  await expect(bloco.getByText(/Produto avariado/)).toBeVisible();

  await bloco.getByRole('button', { name: 'Copiar' }).click();
  await expect(bloco.getByRole('status').filter({ hasText: 'Mensagem copiada.' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Na conferência da devolução ${codigo}`);
  await expect(bloco.getByRole('link', { name: /^Baixar/ }).first()).toHaveAttribute('download', `${codigo}-1.jpg`);
  await semRolagemLateral(page);
  await alvosDeToque44(bloco);

  await bloco.getByRole('button', { name: 'Marcar como respondida' }).click();
  await bloco.getByRole('button', { name: 'Toque de novo para marcar como respondida' }).click();
  await expect(page).toHaveURL(/\?ok=respondida$/);
  await expect(page.getByRole('status').filter({ hasText: 'Contestação marcada como respondida no ML.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Respondida no ML' })).toBeVisible();
  await semRolagemLateral(page);
});

test('"OK para responder no ML": a devolução conferida sem problema aparece e sai ao marcar', async ({ page }) => {
  const { codigo } = await okPendentePronto();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/contestacoes');
  const secao = page.locator('section[aria-labelledby="titulo-ok-ml"]');
  await expect(secao.getByRole('heading', { name: /OK para responder no ML/ })).toBeVisible();
  const cartao = secao.getByRole('article', { name: codigo });
  await expect(cartao.getByText('Loja Falsa 1')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);

  await cartao.getByRole('button', { name: 'Marcar como respondido' }).click();
  await cartao.getByRole('button', { name: 'Toque de novo para marcar como respondido' }).click();
  await expect(page.getByRole('status').filter({ hasText: '"OK" marcado como respondido no ML.' })).toBeVisible();
  await expect(secao.getByRole('article', { name: codigo })).toHaveCount(0);
});

test('alerta "Respostas para dar no ML" leva às Contestações ML', async ({ page }) => {
  await okPendentePronto();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/fluxo/alertas');
  const alerta = page.getByRole('link', { name: /Respostas para dar no ML/ });
  await expect(alerta).toBeVisible();
  await semRolagemLateral(page);
  await alerta.click();
  await expect(page).toHaveURL(/\/contestacoes$/);
  await expect(page.getByRole('heading', { name: /OK para responder no ML/ })).toBeVisible();
});
