import { lerEnv } from '@/lib/env';
import { criarDb } from './client';

type Conexao = ReturnType<typeof criarDb>;

// Guardada no globalThis para o recarregamento do `next dev` não abrir conexões novas a cada edição.
const globalComDb = globalThis as unknown as { __conexaoDb?: Conexao };

export function obterConexao(): Conexao {
  if (!globalComDb.__conexaoDb) {
    globalComDb.__conexaoDb = criarDb(lerEnv().DATABASE_URL);
  }
  return globalComDb.__conexaoDb;
}

export function obterDb() {
  return obterConexao().db;
}
