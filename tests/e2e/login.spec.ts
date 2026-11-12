import { expect, test } from '@playwright/test';
import { ETAPAS } from '../../src/modules/devolucoes/etapas';
import { ehCelular, entrar, entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('manda para o login quem não está autenticado', async ({ page }) => {
  await page.goto('/fluxo');
  await expect(page).toHaveURL(/\/login$/);
});

test('mostra erro com senha errada', async ({ page }) => {
  await entrar(page, { email: USUARIOS_E2E.operador.email, senha: 'senha-errada-000' });
  // O Next também injeta um role=alert vazio (anunciador de rotas); filtra pelo texto do erro.
  await expect(page.getByRole('alert').filter({ hasText: 'E-mail' })).toHaveText('E-mail ou senha incorretos.');
});

test('gestor entra, vê as 5 etapas do PDF e todas as abas, e sai', async ({ page }, testInfo) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await semRolagemLateral(page);

  for (const etapa of ETAPAS) {
    if (ehCelular(testInfo)) {
      // No celular as etapas são os botões do seletor "Etapas", com o nome do PDF no nome acessível.
      await expect(page.getByRole('navigation', { name: 'Etapas' }).getByRole('link', { name: etapa.titulo })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 2, name: etapa.titulo })).toBeVisible();
    }
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
  await entrarComo(page, USUARIOS_E2E.operador);
  await expect(page.getByRole('navigation', { name: 'Seções' }).getByRole('link')).toHaveText(['Fluxo']);

  const resposta = await page.goto('/configuracoes');
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
