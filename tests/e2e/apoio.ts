import { expect, type Page, type TestInfo } from '@playwright/test';

export async function entrar(page: Page, usuario: { email: string; senha: string }) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(usuario.email);
  await page.getByLabel('Senha').fill(usuario.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
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
