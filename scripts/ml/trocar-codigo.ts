import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { trocarCodigo } from '@/conectores/marketplace/mercadolivre/oauth';
import { ARQUIVO_PKCE, ARQUIVO_TOKENS, exigirEnv, salvarTokens } from './comum';

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.error('Uso: npm run ml:trocar-codigo -- <code>');
    process.exit(1);
  }
  const codeVerifier = existsSync(ARQUIVO_PKCE)
    ? (JSON.parse(await readFile(ARQUIVO_PKCE, 'utf8')) as { verifier: string }).verifier
    : undefined;

  const tokens = await trocarCodigo({
    clientId: exigirEnv('ML_CLIENT_ID'),
    clientSecret: exigirEnv('ML_CLIENT_SECRET'),
    code,
    redirectUri: exigirEnv('ML_REDIRECT_URI'),
    codeVerifier,
  });
  await salvarTokens(tokens);
  console.log(`Tokens salvos em ${ARQUIVO_TOKENS} (vendedor ${tokens.userId}, expira em ${tokens.expiraEm}).`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
