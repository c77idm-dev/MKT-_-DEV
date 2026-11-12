import { expect, type Page, type TestInfo } from '@playwright/test';

/** Espera a hidratação (o login é client component) e repete se o dev server recarregar a página. */
export async function entrar(page: Page, usuario: { email: string; senha: string }) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const botao = page.getByRole('button', { name: 'Entrar' });
  await expect(botao).toBeVisible();
  await expect(botao).toBeEnabled();
  await page.getByLabel('E-mail').fill(usuario.email);
  await page.getByLabel('Senha').fill(usuario.senha);
  await botao.click();
}

export function ehCelular(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'celular';
}

/** Mobile-first: a página nunca pode rolar para o lado. */
export async function semRolagemLateral(page: Page) {
  const { conteudo, tela } = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    tela: window.innerWidth,
  }));
  expect(conteudo, 'a página não pode rolar para o lado').toBeLessThanOrEqual(tela);
}
