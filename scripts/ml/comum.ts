import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { renovarTokens, type TokensML } from '@/conectores/marketplace/mercadolivre/oauth';

export const ARQUIVO_TOKENS = '.ml-tokens.json';
export const ARQUIVO_PKCE = '.ml-pkce.json';

export function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Defina ${nome} no .env`);
  return valor;
}

export async function salvarTokens(tokens: TokensML): Promise<void> {
  await writeFile(ARQUIVO_TOKENS, JSON.stringify(tokens, null, 2), 'utf8');
}

/** Lê os tokens locais e renova quando faltam menos de 5 minutos para expirar. */
export async function obterTokensValidos(agora: Date = new Date()): Promise<TokensML> {
  if (!existsSync(ARQUIVO_TOKENS)) {
    throw new Error('Tokens não encontrados. Rode primeiro: npm run ml:autorizar e depois npm run ml:trocar-codigo -- <code>');
  }
  const tokens = JSON.parse(await readFile(ARQUIVO_TOKENS, 'utf8')) as TokensML;
  if (new Date(tokens.expiraEm).getTime() - agora.getTime() > 5 * 60 * 1000) return tokens;

  const novos = await renovarTokens({
    clientId: exigirEnv('ML_CLIENT_ID'),
    clientSecret: exigirEnv('ML_CLIENT_SECRET'),
    refreshToken: tokens.refreshToken,
  });
  await salvarTokens(novos);
  return novos;
}
