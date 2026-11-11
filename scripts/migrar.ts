import { migrar } from '@/db/migrate';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }
  await migrar(url);
  console.log('Migrações aplicadas.');
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
