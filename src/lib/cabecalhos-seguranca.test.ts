import { describe, expect, it } from 'vitest';
import { cabecalhosDeSeguranca, politicaDeConteudo } from './cabecalhos-seguranca';

const mapa = (desenvolvimento: boolean) => Object.fromEntries(cabecalhosDeSeguranca({ desenvolvimento }).map((c) => [c.key, c.value]));

describe('cabeçalhos de segurança (spec §10; decisão 15)', () => {
  it('produção: cabeçalhos básicos, HSTS e CSP', () => {
    const c = mapa(false);
    expect(c['X-Content-Type-Options']).toBe('nosniff');
    expect(c['X-Frame-Options']).toBe('DENY');
    expect(c['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(c['Permissions-Policy']).toBe('camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
    expect(c['Strict-Transport-Security']).toBe('max-age=31536000');
    expect(c['Content-Security-Policy']).toBe(politicaDeConteudo({ desenvolvimento: false }));
  });

  it('a CSP libera só o que o sistema usa', () => {
    const csp = politicaDeConteudo({ desenvolvimento: false });
    for (const diretiva of [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://auth.mercadolivre.com.br",
      "frame-ancestors 'none'",
    ]) {
      expect(csp.split('; ')).toContain(diretiva);
    }
    expect(csp).not.toMatch(/(^|\s)'unsafe-eval'/);
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(csp).not.toMatch(/\n/);
  });

  it('desenvolvimento: unsafe-eval (o next dev precisa) e sem HSTS', () => {
    const c = mapa(true);
    expect(c['Content-Security-Policy']).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'");
    expect(c['Strict-Transport-Security']).toBeUndefined();
  });
});
