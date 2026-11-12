import type { FullConfig } from '@playwright/test';
import { criarDb } from '../../src/db/client';
import { migrar } from '../../src/db/migrate';
import { criarUsuario } from '../../src/modules/auth/usuarios';
import { limparTabelas } from '../helpers/db';
import { USUARIOS_E2E } from './dados';

/** O primeiro acesso a uma rota no `next dev` compila a rota e é lento (pendência da Fase 0): aquece antes dos testes. */
const ROTAS_AQUECIMENTO = [
  '/login',
  '/fluxo',
  '/manifest.webmanifest',
  '/icones/192',
];

export default async function globalSetup(config: FullConfig) {
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
  await aquecer(config.projects[0]?.use.baseURL);
}

async function aquecer(base: string | undefined) {
  if (!base) return;
  for (const rota of ROTAS_AQUECIMENTO) {
    await fetch(new URL(rota, base), { redirect: 'manual' }).catch(() => undefined);
  }
}
