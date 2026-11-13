import { describe, expect, it } from 'vitest';
import { cabecalhosDoArquivo } from './cabecalhos';

describe('cabecalhosDoArquivo (segurança e cache das mídias)', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'])('%s: inline, com CSP em sandbox', (tipo) => {
    const h = cabecalhosDoArquivo(tipo, 300);
    expect(h['content-disposition']).toBe('inline');
    expect(h['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
  });

  it.each(['application/xml', 'application/octet-stream', 'video/quicktime', 'text/html'])('%s: sempre como download', (tipo) => {
    expect(cabecalhosDoArquivo(tipo, 300)['content-disposition']).toBe('attachment');
  });

  it('só vídeo guarda cache (o Range precisa); o resto é private, no-store', () => {
    expect(cabecalhosDoArquivo('video/mp4', 300)['cache-control']).toBe('private, max-age=300');
    expect(cabecalhosDoArquivo('image/png', 300)['cache-control']).toBe('private, no-store');
    expect(cabecalhosDoArquivo('application/xml', 300)['cache-control']).toBe('private, no-store');
  });
});
