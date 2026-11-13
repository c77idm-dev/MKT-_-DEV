import { expect, test } from '@playwright/test';
import { entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

const CARTOES: [string, string][] = [
  ['Usuários', '/configuracoes/usuarios'],
  ['Conferência e mídias', '/configuracoes/conferencia'],
  ['Mercado Livre', '/configuracoes/mercado-livre'],
  ['Fiscal', '/configuracoes/fiscal'],
  ['Falhas', '/configuracoes/falhas'],
];

test('o Gestor vê os cartões das Configurações; as áreas das próximas fases avisam a fase', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes');
  for (const [nome, href] of CARTOES) {
    await expect(page.getByRole('link', { name: new RegExp(`^${nome}`) })).toHaveAttribute('href', href);
  }
  await semRolagemLateral(page);
  await page.getByRole('link', { name: /^Mercado Livre/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado Livre' })).toBeVisible();
  await expect(page.getByText('Esta área chega na Fase 3 do projeto.')).toBeVisible();
});

test('o Operador não abre as Configurações novas', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.operador);
  await paginaNaoEncontrada(page, '/configuracoes/conferencia');
});
