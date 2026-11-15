import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { prepararFalha, prepararNotaRejeitada, prepararPrazoVencendo } from './apoio-acabamento';
import { prepararSemFornecedor } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

test('Operador vê "Prazo do ML vencendo" no painel e abre a lista do alerta', async ({ page }) => {
  const { codigo } = await prepararPrazoVencendo();
  await entrarComo(page, USUARIOS_E2E.operador);
  const alertas = page.getByRole('region', { name: 'Alertas' });
  await expect(alertas.getByRole('link', { name: /^Prazo do ML vencendo/ })).toBeVisible();
  await expect(alertas.getByRole('link', { name: /^NF rejeitada/ })).toHaveCount(0);
  await semRolagemLateral(page);
  await alertas.getByRole('link', { name: /^Prazo do ML vencendo/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/alertas#prazo_ml$/);
  const secao = page.getByRole('region', { name: /^Prazo do ML vencendo/ });
  await expect(secao.getByRole('link', { name: new RegExp(`^${codigo}`) })).toBeVisible();
  await semRolagemLateral(page);
});

test('Fiscal vê "NF rejeitada" e "Itens sem fornecedor"', async ({ page }) => {
  const { codigo } = await prepararNotaRejeitada();
  await prepararSemFornecedor();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  const alertas = page.getByRole('region', { name: 'Alertas' });
  await expect(alertas.getByRole('link', { name: /^Itens sem fornecedor/ })).toHaveAttribute('href', '/lotes/sem-fornecedor');
  await alertas.getByRole('link', { name: /^NF rejeitada/ }).click();
  await expect(page.getByRole('region', { name: /^NF rejeitada/ }).getByRole('link', { name: new RegExp(`^${codigo}`) })).toBeVisible();
});

test('Gestor: o painel mostra no máximo 3 alertas; "Ver todos" leva a "Tarefas em Falhas"', async ({ page }) => {
  await prepararFalha();
  await prepararPrazoVencendo();
  await prepararNotaRejeitada();
  await prepararSemFornecedor();
  await entrarComo(page, USUARIOS_E2E.gestor);
  const alertas = page.getByRole('region', { name: 'Alertas' });
  await expect(alertas.getByRole('listitem')).toHaveCount(3);
  await alertas.getByRole('link', { name: /^Ver todos os alertas \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/\/fluxo\/alertas$/);
  await semRolagemLateral(page);
  await page.getByRole('region', { name: 'Alertas' }).getByRole('link', { name: /^Tarefas em Falhas/ }).click();
  await expect(page.getByRole('heading', { name: 'Falhas', level: 1 })).toBeVisible();
});
