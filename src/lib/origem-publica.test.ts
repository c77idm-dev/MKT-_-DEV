import { describe, expect, it } from 'vitest';
import { origemPublica } from './origem-publica';

const de = (h: Record<string, string>) => origemPublica(new Headers(h));

describe('origemPublica (E28: o endereço dos links do PDF, tirado do pedido)', () => {
  it('atrás do nginx: Host e X-Forwarded-Proto https', () => {
    expect(de({ host: 'devolucoes.exemplo.com.br', 'x-forwarded-host': 'devolucoes.exemplo.com.br', 'x-forwarded-proto': 'https' })).toBe(
      'https://devolucoes.exemplo.com.br',
    );
    // Maiúsculas no Host e mais de um proxy no X-Forwarded-Proto (vale o primeiro, o do cliente).
    expect(de({ host: 'Devolucoes.Exemplo.com.br', 'x-forwarded-proto': 'https, http' })).toBe('https://devolucoes.exemplo.com.br');
    expect(de({ host: 'devolucoes.exemplo.com.br:8443', 'x-forwarded-proto': 'https' })).toBe('https://devolucoes.exemplo.com.br:8443');
  });

  it('no próprio computador (e2e e desenvolvimento, sem nginx): http vale só para localhost', () => {
    expect(de({ host: 'localhost:3108' })).toBe('http://localhost:3108');
    expect(de({ host: '127.0.0.1:3000' })).toBe('http://127.0.0.1:3000');
    expect(de({ host: '[::1]:3000' })).toBe('http://[::1]:3000');
    expect(de({ host: 'localhost:3108', 'x-forwarded-proto': 'https' })).toBe('https://localhost:3108');
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
