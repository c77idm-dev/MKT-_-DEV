import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client';
import { usuarios } from '../../src/db/schema';
import { criarDbTeste } from '../helpers/db';
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

/**
 * Mobile-first: a página nunca pode rolar para o lado. Compara com a largura do viewport configurada, e não com
 * `window.innerWidth`: no celular (`isMobile`) o Chromium aumenta o viewport de layout até o `scrollWidth`,
 * e a comparação com `innerWidth` nunca falharia.
 */
export async function semRolagemLateral(page: Page) {
  const conteudo = await page.evaluate(() => document.documentElement.scrollWidth);
  const tela = page.viewportSize()!.width;
  expect(conteudo, 'a página não pode rolar para o lado').toBeLessThanOrEqual(tela);
}

/**
 * A rota responde como "não encontrada" (a tela 404 do sistema, com noindex). Não confere o código HTTP: com o
 * `loading.tsx` da área logada a resposta já começou em streaming e o Next mantém 200 (ver docs, loading.md › Status codes).
 */
export async function paginaNaoEncontrada(page: Page, rota: string) {
  await page.goto(rota);
  await expect(page.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
}

/** O elemento está no centro da tela visível e é o mais alto ali: a barra de abas fixa não o cobre. */
export async function naFrente(elemento: Locator) {
  await expect(elemento).toBeInViewport();
  const livre = await elemento.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return topo !== null && el.contains(topo);
  });
  expect(livre, 'nenhum outro elemento (barra de abas, rodapé) cobre o centro do elemento').toBe(true);
}

/** Espera a hidratação do React: ele marca os elementos do DOM com `__reactProps$…` quando assume a página. */
export async function aguardarHidratacao(elemento: Locator) {
  await expect
    .poll(() => elemento.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))))
    .toBe(true);
  // Deixa os efeitos da hidratação (como o foco automático) rodarem antes de afirmar que NÃO houve foco.
  await elemento.page().evaluate(() => new Promise<void>((ok) => setTimeout(ok, 100)));
}

/** Entra e espera o login terminar (redirecionamento para /fluxo), para o teste poder navegar em seguida. */
export async function entrarComo(page: Page, usuario: { email: string; senha: string }) {
  await entrar(page, usuario);
  await expect(page).toHaveURL(/\/fluxo$/);
}

/** Abre uma conexão com o banco de testes (o mesmo do servidor do e2e) só para preparar dados com as fábricas. */
export async function comBanco<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, sql } = criarDbTeste();
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
  const painel = page.locator('#painel-busca');
  // Espera (web-first) o botão do celular ou o painel já aberto do computador, em vez de checar uma vez só.
  await expect(botao.or(painel).first()).toBeVisible();
  if (await botao.isVisible()) {
    if ((await botao.getAttribute('aria-expanded')) !== 'true') await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(painel).toBeVisible();
}
