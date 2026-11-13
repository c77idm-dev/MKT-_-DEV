import { describe, expect, it } from 'vitest';
import { chaveEvidencia, tipoConteudoPorExtensao, validarChave } from './chaves';
import { ErroChaveInvalida } from './erros';

describe('chaves do armazenamento (contrato §5.2)', () => {
  it('evidencias/{devolucaoId}/{evidenciaId}.{jpg|mp4}', () => {
    expect(chaveEvidencia('d1', 'e1', 'jpg')).toBe('evidencias/d1/e1.jpg');
    expect(chaveEvidencia('d1', 'e2', 'mp4')).toBe('evidencias/d1/e2.mp4');
  });

  it('aceita chaves simples e recusa caminhos perigosos', () => {
    expect(() => validarChave('nfe/2026/11/abc-danfe.pdf')).not.toThrow();
    for (const ruim of ['', '../x', '/x', 'a//b', 'a b', 'a/../b', 'a\\b', 'x'.repeat(301)]) {
      expect(() => validarChave(ruim), ruim).toThrow(ErroChaveInvalida);
    }
  });

  it('tipo do conteúdo pela extensão', () => {
    expect(tipoConteudoPorExtensao('a/b.jpg')).toBe('image/jpeg');
    expect(tipoConteudoPorExtensao('a/b.mp4')).toBe('video/mp4');
    expect(tipoConteudoPorExtensao('a/b.xml')).toBe('application/xml');
    expect(tipoConteudoPorExtensao('a/b.pdf')).toBe('application/pdf');
    expect(tipoConteudoPorExtensao('a/b.bin')).toBe('application/octet-stream');
  });
});
