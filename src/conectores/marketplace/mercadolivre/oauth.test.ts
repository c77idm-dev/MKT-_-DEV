import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ErroML } from './cliente';
import { gerarPkce, montarUrlAutorizacao, renovarTokens, trocarCodigo, URL_TOKEN_ML } from './oauth';

const RESPOSTA = { access_token: 'APP_USR-a', refresh_token: 'TG-r', expires_in: 21600, user_id: 123, scope: 'offline_access read write' };

function fetchQueResponde(corpo: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

type FetchFalso = { mock: { calls: unknown[][] } };

function chamada(fetchFn: FetchFalso): [string, RequestInit] {
  return fetchFn.mock.calls[0] as unknown as [string, RequestInit];
}

function corpoEnviado(fetchFn: FetchFalso): URLSearchParams {
  return new URLSearchParams(String(chamada(fetchFn)[1].body));
}

describe('montarUrlAutorizacao', () => {
  it('monta a URL de autorização do ML Brasil', () => {
    const url = new URL(montarUrlAutorizacao({ clientId: '999', redirectUri: 'https://x.com/retorno', state: 'abc' }));
    expect(url.origin + url.pathname).toBe('https://auth.mercadolivre.com.br/authorization');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: '999',
      redirect_uri: 'https://x.com/retorno',
      state: 'abc',
    });
  });

  it('inclui o PKCE quando informado', () => {
    const url = new URL(montarUrlAutorizacao({ clientId: '1', redirectUri: 'https://x', state: 's', codeChallenge: 'CH' }));
    expect(url.searchParams.get('code_challenge')).toBe('CH');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('gerarPkce', () => {
  it('gera o challenge S256 do verifier', () => {
    const { verifier, challenge } = gerarPkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('trocarCodigo', () => {
  it('envia o code e devolve os tokens com a data de expiração', async () => {
    const fetchFn = fetchQueResponde(RESPOSTA);
    const agora = new Date('2026-11-11T12:00:00Z');
    const tokens = await trocarCodigo({
      clientId: '999',
      clientSecret: 'SEGREDO',
      code: 'TG-code',
      redirectUri: 'https://x.com/retorno',
      codeVerifier: 'VER',
      fetchFn,
      agora,
    });

    expect(tokens).toEqual({
      accessToken: 'APP_USR-a',
      refreshToken: 'TG-r',
      expiraEm: '2026-11-11T18:00:00.000Z',
      userId: 123,
      escopo: 'offline_access read write',
    });
    expect(chamada(fetchFn)[0]).toBe(URL_TOKEN_ML);
    expect(Object.fromEntries(corpoEnviado(fetchFn))).toEqual({
      grant_type: 'authorization_code',
      client_id: '999',
      client_secret: 'SEGREDO',
      code: 'TG-code',
      redirect_uri: 'https://x.com/retorno',
      code_verifier: 'VER',
    });
  });

  it('lança ErroML quando o ML recusa', async () => {
    const fetchFn = fetchQueResponde({ error: 'invalid_grant' }, 400);
    await expect(
      trocarCodigo({ clientId: '1', clientSecret: 's', code: 'c', redirectUri: 'https://x', fetchFn }),
    ).rejects.toBeInstanceOf(ErroML);
  });

  it('lança ErroML quando um 200 não é JSON', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>x</html>', { status: 200 }));
    await expect(
      trocarCodigo({ clientId: '1', clientSecret: 's', code: 'c', redirectUri: 'https://x', fetchFn }),
    ).rejects.toBeInstanceOf(ErroML);
  });
});

describe('renovarTokens', () => {
  it('usa o refresh_token', async () => {
    const fetchFn = fetchQueResponde(RESPOSTA);
    await renovarTokens({ clientId: '999', clientSecret: 'SEGREDO', refreshToken: 'TG-velho', fetchFn });
    expect(Object.fromEntries(corpoEnviado(fetchFn))).toEqual({
      grant_type: 'refresh_token',
      client_id: '999',
      client_secret: 'SEGREDO',
      refresh_token: 'TG-velho',
    });
  });
});
