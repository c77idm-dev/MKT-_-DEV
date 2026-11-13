import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ErroML } from './cliente';

export const URL_AUTORIZACAO_ML = 'https://auth.mercadolivre.com.br/authorization';
export const URL_TOKEN_ML = 'https://api.mercadolibre.com/oauth/token';

export type TokensML = {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601. O access token dura 6 h (spec §7.1). */
  expiraEm: string;
  userId: number;
  escopo: string;
};

export function gerarPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function montarUrlAutorizacao(p: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}): string {
  const url = new URL(URL_AUTORIZACAO_ML);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('state', p.state);
  if (p.codeChallenge) {
    url.searchParams.set('code_challenge', p.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

const esquemaRespostaToken = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.coerce.number().int().positive(),
  scope: z.string().default(''),
});

async function pedirToken(corpo: Record<string, string>, fetchFn: typeof fetch, agora: Date): Promise<TokensML> {
  const resposta = await fetchFn(URL_TOKEN_ML, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(corpo).toString(),
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new ErroML(resposta.status, texto, '/oauth/token');
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new ErroML(resposta.status, '[resposta do token não é JSON]', '/oauth/token');
  }
  const lido = esquemaRespostaToken.safeParse(bruto);
  // Nunca guarde o corpo no erro: ele pode trazer o access_token.
  if (!lido.success) {
    const campos = lido.error.issues.map((i) => i.path.join('.') || '(raiz)').join(', ');
    throw new ErroML(resposta.status, `[resposta do token fora do formato: ${campos}]`, '/oauth/token');
  }
  const d = lido.data;
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiraEm: new Date(agora.getTime() + d.expires_in * 1000).toISOString(),
    userId: d.user_id,
    escopo: d.scope,
  };
}

export function trocarCodigo(p: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  fetchFn?: typeof fetch;
  agora?: Date;
}): Promise<TokensML> {
  const corpo: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: p.clientId,
    client_secret: p.clientSecret,
    code: p.code,
    redirect_uri: p.redirectUri,
  };
  if (p.codeVerifier) corpo.code_verifier = p.codeVerifier;
  return pedirToken(corpo, p.fetchFn ?? fetch, p.agora ?? new Date());
}

/** O refresh token do ML é de uso único: sempre guarde o novo (spec §7.1). */
export function renovarTokens(p: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchFn?: typeof fetch;
  agora?: Date;
}): Promise<TokensML> {
  return pedirToken(
    { grant_type: 'refresh_token', client_id: p.clientId, client_secret: p.clientSecret, refresh_token: p.refreshToken },
    p.fetchFn ?? fetch,
    p.agora ?? new Date(),
  );
}
