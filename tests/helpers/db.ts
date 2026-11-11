import { criarDb } from '@/db/client';

export function urlBancoTeste(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  return url;
}

export function criarDbTeste() {
  return criarDb(urlBancoTeste());
}
