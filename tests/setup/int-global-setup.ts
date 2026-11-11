import { migrar } from '../../src/db/migrate';

export default async function aplicarMigracoes() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no .env');
  await migrar(url);
}
