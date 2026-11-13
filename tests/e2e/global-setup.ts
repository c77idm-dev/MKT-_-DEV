import { spawn } from 'node:child_process';
import { mkdirSync, openSync, rmSync } from 'node:fs';
import { criarDb } from '../../src/db/client';
import { migrar } from '../../src/db/migrate';
import { criarUsuario } from '../../src/modules/auth/usuarios';
import { limparTabelas, urlBancoTeste } from '../helpers/db';
import { AMBIENTE_E2E, USUARIOS_E2E } from './dados';

/**
 * Prepara o banco de testes, sobe o worker do e2e (o mesmo banco e o mesmo disco do servidor) e devolve
 * a função que o encerra no fim (o Playwright usa o retorno do globalSetup como teardown).
 */
export default async function globalSetup() {
  const url = urlBancoTeste();
  await migrar(url);
  const { db, sql } = criarDb(url);
  try {
    await limparTabelas(sql);
    // Tarefas de execuções anteriores: o limparTabelas só esvazia o schema public.
    await sql.unsafe(`do $$ begin if to_regclass('pgboss.job') is not null then truncate table pgboss.job; end if; end $$`);
    await criarUsuario(db, USUARIOS_E2E.gestor);
    await criarUsuario(db, USUARIOS_E2E.operador);
    await criarUsuario(db, USUARIOS_E2E.fiscal);
  } finally {
    await sql.end();
  }
  rmSync('.dados-e2e', { recursive: true, force: true });
  mkdirSync('.dados-e2e', { recursive: true });
  const log = openSync('.dados-e2e/worker.log', 'a');
  const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/worker.ts'], {
    // AMBIENTE_E2E traz PERMITIR_FALSOS=1 (contrato §10, E1).
    env: { ...process.env, ...AMBIENTE_E2E, DATABASE_URL: url },
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  return async () => {
    worker.kill();
  };
}
