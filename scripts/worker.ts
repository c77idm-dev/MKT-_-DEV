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
    try {
      await worker.parar();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void parar());
  process.on('SIGINT', () => void parar());
}

// Só a mensagem: nunca payloads nem tokens.
process.on('unhandledRejection', (erro) => {
  console.error('Promessa rejeitada sem tratamento:', erro instanceof Error ? erro.message : 'erro desconhecido');
  process.exit(1);
});

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
