import { describe, expect, it } from 'vitest';
import { avaliarOrigemPublica, origemPublica } from './origem-publica';

/** Desenvolvimento e testes: o localhost vale (sem nginx). */
const DEV = { NODE_ENV: 'development', PERMITIR_FALSOS: '0' } as const;
/** A VPS: produção, sem os falsos. */
const PRODUCAO = { NODE_ENV: 'production', PERMITIR_FALSOS: '0' } as const;
/** O e2e: build de produção (`next start`) com PERMITIR_FALSOS=1. */
const E2E = { NODE_ENV: 'production', PERMITIR_FALSOS: '1' } as const;

const de = (h: Record<string, string>, ambiente: typeof DEV | typeof PRODUCAO | typeof E2E = DEV) => origemPublica(new Headers(h), ambiente);

describe('origemPublica (E28: o endereço dos links do PDF, tirado do pedido)', () => {
  it('atrás do nginx: Host e X-Forwarded-Proto https', () => {
    for (const ambiente of [DEV, PRODUCAO, E2E]) {
      expect(de({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-host': 'devolucoes.exemplo.com.br', 'x-forwarded-proto': 'https' }, ambiente)).toBe(
        'https://devolucoes.exemplo.com.br',
      );
    }
    // Maiúsculas no Host e mais de um proxy no X-Forwarded-Proto (vale o primeiro, o do cliente).
    expect(de({ host: 'Devolucoes.Exemplo.com.br', 'x-forwarded-proto': 'https, http' })).toBe('https://devolucoes.exemplo.com.br');
    expect(de({ host: 'devolucoes.exemplo.com.br:8443', 'x-forwarded-proto': 'https' })).toBe('https://devolucoes.exemplo.com.br:8443');
  });

  it('no próprio computador (e2e e desenvolvimento, sem nginx): http vale só para localhost', () => {
    expect(de({ host: 'localhost:3108' })).toBe('http://localhost:3108');
    expect(de({ host: '127.0.0.1:3000' })).toBe('http://127.0.0.1:3000');
    expect(de({ host: '[::1]:3000' })).toBe('http://[::1]:3000');
    expect(de({ host: 'localhost:3108', 'x-forwarded-proto': 'https' })).toBe('https://localhost:3108');
    // O e2e roda o build de produção (`next start`) com PERMITIR_FALSOS=1.
    expect(de({ host: 'localhost:3108' }, E2E)).toBe('http://localhost:3108');
  });

  it('em produção, o localhost não é o endereço público (ex.: túnel SSH até 127.0.0.1:3020): sem link', () => {
    for (const host of ['localhost:3020', '127.0.0.1:3020', '[::1]:3020', 'localhost']) {
      expect(de({ host }, PRODUCAO), host).toBeNull();
      expect(de({ host, 'x-forwarded-proto': 'https' }, PRODUCAO), host).toBeNull();
    }
  });

  it('http fora do localhost: sem link (o PDF sai sem os links)', () => {
    expect(de({ host: 'devolucoes.exemplo.com.br' })).toBeNull();
    expect(de({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-proto': 'http' })).toBeNull();
    expect(de({ host: '203.0.113.7', 'x-forwarded-proto': 'http' })).toBeNull();
    expect(de({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-proto': 'ftp' })).toBeNull();
  });

  it('Host estranho ou que não bate com o X-Forwarded-Host: sem link', () => {
    for (const host of ['', 'evil.com/caminho', 'user@evil.com', 'evil.com?x=1', 'evil.com#x', 'evil .com', 'evil.com:99999', 'evil.com:', '-evil.com', 'evil..com', 'a'.repeat(300)]) {
      expect(de({ host, 'x-forwarded-proto': 'https' }), host).toBeNull();
    }
    expect(de({ 'x-forwarded-proto': 'https' })).toBeNull();
    expect(de({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-host': 'evil.com', 'x-forwarded-proto': 'https' })).toBeNull();
  });
});

describe('avaliarOrigemPublica: o motivo de ficar sem link, para o aviso no log (nunca o cabeçalho bruto)', () => {
  const motivo = (h: Record<string, string>, ambiente: typeof DEV | typeof PRODUCAO = PRODUCAO) => avaliarOrigemPublica(new Headers(h), ambiente);

  it('com o endereço público, sem motivo', () => {
    expect(motivo({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-proto': 'https' })).toEqual({ url: 'https://devolucoes.exemplo.com.br' });
  });

  it('cada motivo', () => {
    expect(motivo({})).toEqual({ url: null, motivo: 'host_invalido' });
    expect(motivo({ host: 'evil.com/x', 'x-forwarded-proto': 'https' })).toEqual({ url: null, motivo: 'host_invalido' });
    expect(motivo({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-host': 'evil.com', 'x-forwarded-proto': 'https' })).toEqual({
      url: null,
      motivo: 'host_diferente_do_encaminhado',
    });
    expect(motivo({ host: 'devolucoes.exemplo.com.br' })).toEqual({ url: null, motivo: 'sem_https' });
    expect(motivo({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-proto': 'http' })).toEqual({ url: null, motivo: 'sem_https' });
    expect(motivo({ host: '127.0.0.1:3020' })).toEqual({ url: null, motivo: 'localhost_em_producao' });
    expect(motivo({ host: 'localhost:3020', 'x-forwarded-proto': 'https' })).toEqual({ url: null, motivo: 'localhost_em_producao' });
  });
});
