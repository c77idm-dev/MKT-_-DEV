import { expect, type Page, type TestInfo } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { criarDb, type Db } from '../../src/db/client';
import { usuarios } from '../../src/db/schema';
import type { UsuarioSessao } from '../../src/modules/auth/usuarios';

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

/** Entra e espera o login terminar (redirecionamento para /fluxo), para o teste poder navegar em seguida. */
export async function entrarComo(page: Page, usuario: { email: string; senha: string }) {
  await entrar(page, usuario);
  await expect(page).toHaveURL(/\/fluxo$/);
}

/** Abre uma conexão com o banco de testes (o mesmo do servidor do e2e) só para preparar dados com as fábricas. */
export async function comBanco<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  const { db, sql } = criarDb(url);
  try {
    return await fn(db);
  } finally {
    await sql.end();
  }
}

export async function usuarioPorEmail(db: Db, email: string): Promise<UsuarioSessao> {
  const [u] = await db
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil })
    .from(usuarios)
    .where(eq(usuarios.email, email));
  if (!u) throw new Error(`O usuário ${email} não existe no banco de testes`);
  return u;
}

/** Código único por execução (o banco do e2e é o mesmo para o computador e o celular). */
export function codigoUnico(prefixo: string): string {
  const sorte = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0');
  return `${prefixo}${Date.now().toString(36).toUpperCase()}${sorte}`;
}

/** No celular a Busca Avançada fica atrás do botão "Filtros"; no computador ela já está aberta. */
export async function abrirBusca(page: Page) {
  const botao = page.getByRole('button', { name: /^Filtros/ });
  if ((await botao.isVisible()) && (await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
}
