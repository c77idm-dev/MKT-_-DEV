import { randomBytes, timingSafeEqual } from 'node:crypto';
import { gerarPkce } from '@/conectores/marketplace/mercadolivre/oauth';
import { cifrar, decifrar } from '@/lib/cifra';

export const COOKIE_OAUTH_ML = 'ml_oauth';
export const CAMINHO_RETORNO_ML = '/api/ml/retorno';
export const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

export type EstadoOAuth = { state: string; verifier: string | null; usuarioId: string; expiraEm: number };

/** O `state` (e o verifier do PKCE) ficam num cookie cifrado, preso ao Gestor que pediu, por 10 minutos. */
export function criarEstadoOAuth(p: { usuarioId: string; usarPkce: boolean; chave: Buffer; agora: Date }): {
  cookie: string;
  state: string;
  challenge: string | null;
} {
  const state = randomBytes(16).toString('hex');
  const pkce = p.usarPkce ? gerarPkce() : null;
  const estado: EstadoOAuth = { state, verifier: pkce?.verifier ?? null, usuarioId: p.usuarioId, expiraEm: p.agora.getTime() + VALIDADE_ESTADO_MS };
  return { cookie: cifrar(JSON.stringify(estado), p.chave), state, challenge: pkce?.challenge ?? null };
}

export function lerEstadoOAuth(cookie: string | undefined, chave: Buffer, agora: Date): EstadoOAuth | null {
  if (!cookie) return null;
  try {
    const e = JSON.parse(decifrar(cookie, chave)) as Partial<EstadoOAuth>;
    if (typeof e.state !== 'string' || typeof e.usuarioId !== 'string' || typeof e.expiraEm !== 'number') return null;
    if (e.expiraEm < agora.getTime()) return null;
    return { state: e.state, verifier: typeof e.verifier === 'string' ? e.verifier : null, usuarioId: e.usuarioId, expiraEm: e.expiraEm };
  } catch {
    return null;
  }
}

/** Comparação de tempo constante (não vaza quantos caracteres batem). */
export function mesmoState(esperado: string, recebido: string | null): boolean {
  if (!recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}
