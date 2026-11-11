import { expect, test, type Page } from '@playwright/test';
import { ETAPAS } from '../../src/modules/devolucoes/etapas';
import { USUARIOS_E2E } from './dados';

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('manda para o login quem não está autenticado', async ({ page }) => {
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('mostra erro com senha errada', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador.email, 'senha-errada-000');
  // O Next também injeta um role=alert vazio (anunciador de rotas); filtra pelo texto do erro.
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail' })).toHaveText('E-mail ou senha incorretos.');
});

test('gestor entra, vê as 5 etapas do PDF e todas as abas, e sai', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.gestor.email, USUARIOS_E2E.gestor.senha);
  await expect(page).toHaveURL(/\/fluxo$/);

  for (const etapa of ETAPAS) {
    await expect(page.getByRole('heading', { level: 2, name: etapa.titulo })).toBeVisible();
  }
  const nav = page.getByRole('navigation', { name: 'Seções' });
  await expect(nav.getByRole('link')).toHaveText([
    'Fluxo',
    'Contestações ML',
    'Lotes e Remessas',
    'Produtos e Fornecedores',
    'Configurações',
  ]);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('operador vê só a aba Fluxo e não acessa Configurações', async ({ page }) => {
  await entrar(page, USUARIOS_E2E.operador.email, USUARIOS_E2E.operador.senha);
  await expect(page).toHaveURL(/\/fluxo$/);
  await expect(page.getByRole('navigation', { name: 'Seções' }).getByRole('link')).toHaveText(['Fluxo']);

  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
