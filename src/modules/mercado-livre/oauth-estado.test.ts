import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar } from '@/lib/cifra';
import { criarEstadoOAuth, lerEstadoOAuth, mesmoState, VALIDADE_ESTADO_MS } from './oauth-estado';

const CHAVE = randomBytes(32);
const AGORA = new Date('2026-11-12T15:00:00Z');

describe('estado do OAuth no cookie cifrado (pendência da Fase 0: conferir o state)', () => {
  it('cria o cookie e o lê de volta, com o mesmo state e o usuário', () => {
    const { cookie, state, challenge } = criarEstadoOAuth({ usuarioId: 'u1', usarPkce: false, chave: CHAVE, agora: AGORA });
    expect(cookie).not.toContain(state);
    expect(challenge).toBeNull();
    expect(lerEstadoOAuth(cookie, CHAVE, AGORA)).toEqual({ state, verifier: null, usuarioId: 'u1', expiraEm: AGORA.getTime() + VALIDADE_ESTADO_MS });
  });

  it('com PKCE, guarda o verifier e devolve o challenge S256 dele', () => {
    const { cookie, challenge } = criarEstadoOAuth({ usuarioId: 'u1', usarPkce: true, chave: CHAVE, agora: AGORA });
    const verifier = lerEstadoOAuth(cookie, CHAVE, AGORA)?.verifier ?? '';
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('vencido, alterado, com outra chave ou fora do formato: null', () => {
    const { cookie } = criarEstadoOAuth({ usuarioId: 'u1', usarPkce: false, chave: CHAVE, agora: AGORA });
    expect(lerEstadoOAuth(cookie, CHAVE, new Date(AGORA.getTime() + VALIDADE_ESTADO_MS + 1))).toBeNull();
    const partes = cookie.split('.');
    partes[3] = `${partes[3][0] === 'A' ? 'B' : 'A'}${partes[3].slice(1)}`;
    expect(lerEstadoOAuth(partes.join('.'), CHAVE, AGORA)).toBeNull();
    expect(lerEstadoOAuth(cookie, randomBytes(32), AGORA)).toBeNull();
    expect(lerEstadoOAuth(cifrar('{"state":1}', CHAVE), CHAVE, AGORA)).toBeNull();
    expect(lerEstadoOAuth(undefined, CHAVE, AGORA)).toBeNull();
  });

  it('mesmoState: igual só quando é igual, e recusa vazio', () => {
    expect(mesmoState('abc', 'abc')).toBe(true);
    expect(mesmoState('abc', 'abd')).toBe(false);
    expect(mesmoState('abc', 'abcd')).toBe(false);
    expect(mesmoState('abc', null)).toBe(false);
  });
});
