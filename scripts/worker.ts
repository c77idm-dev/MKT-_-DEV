import { iniciarWorker } from '@/worker';

/** Processo das tarefas de fundo (spec §4.1). Em produção: `node dist/worker.mjs`; no PC: `npm run worker`. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }
  const worker = await iniciarWorker({ url });
  let parando = false;
  const parar = async () => {
    if (parando) return;
    parando = true;
    await worker.parar();
    process.exit(0);
  };
  process.on('SIGTERM', () => void parar());
  process.on('SIGINT', () => void parar());
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
