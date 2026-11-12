import { chromium } from '@playwright/test';
import { criarDb } from '../../src/db/client';
import { migrar } from '../../src/db/migrate';
import { criarUsuario } from '../../src/modules/auth/usuarios';
import { limparTabelas } from '../helpers/db';
import { URL_E2E, USUARIOS_E2E } from './dados';

/** O primeiro acesso a uma rota no `next dev` compila a rota e é lento (pendência da Fase 0): aquece antes dos testes. */
const ROTAS_AQUECIMENTO = [
  '/login',
  '/fluxo',
  '/manifest.webmanifest',
  '/icones/192',
];

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  await migrar(url);
  const { db, sql } = criarDb(url);
  try {
    await limparTabelas(sql);
    await criarUsuario(db, USUARIOS_E2E.gestor);
    await criarUsuario(db, USUARIOS_E2E.operador);
    await criarUsuario(db, USUARIOS_E2E.fiscal);
  } finally {
    await sql.end();
  }
  await aquecer(URL_E2E);
}

/** Aquece também as rotas logadas: entra uma vez com o GESTOR e abre as páginas com a sessão. */
async function aquecer(base: string) {
  for (const rota of ROTAS_AQUECIMENTO) {
    await fetch(new URL(rota, base), { redirect: 'manual' }).catch(() => undefined);
  }
  const navegador = await chromium.launch();
  try {
    const page = await navegador.newPage({ baseURL: base });
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('E-mail').fill(USUARIOS_E2E.gestor.email);
    await page.getByLabel('Senha').fill(USUARIOS_E2E.gestor.senha);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/fluxo$/, { timeout: 60_000 });
    await page.goto('/configuracoes', { waitUntil: 'networkidle' });
    await page.goto('/fluxo', { waitUntil: 'networkidle' });
  } catch {
    // aquecimento é só otimização; os testes dizem o que falhou
  } finally {
    await navegador.close();
  }
}
