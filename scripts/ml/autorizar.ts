import { randomBytes } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { gerarPkce, montarUrlAutorizacao } from '@/conectores/marketplace/mercadolivre/oauth';
import { ARQUIVO_PKCE, exigirEnv } from './comum';

async function main() {
  const clientId = exigirEnv('ML_CLIENT_ID');
  const redirectUri = exigirEnv('ML_REDIRECT_URI');
  const state = randomBytes(16).toString('hex');

  let codeChallenge: string | undefined;
  if (process.env.ML_USAR_PKCE === 'true') {
    const pkce = gerarPkce();
    codeChallenge = pkce.challenge;
    await writeFile(ARQUIVO_PKCE, JSON.stringify({ verifier: pkce.verifier, state }), 'utf8');
  } else {
    // Um verifier antigo faria o trocar-codigo enviar PKCE sem o app exigir.
    await rm(ARQUIVO_PKCE, { force: true });
  }

  console.log('1) Abra este endereço logado na CONTA PRINCIPAL do Mercado Livre (não use conta de colaborador) e autorize:\n');
  console.log(montarUrlAutorizacao({ clientId, redirectUri, state, codeChallenge }));
  console.log('\n2) O navegador vai para o endereço de retorno (a página pode dar 404, tudo bem).');
  console.log('   Copie o valor de "code" da barra de endereço e rode:  npm run ml:trocar-codigo -- <code>');
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
