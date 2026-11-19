import { describe, expect, it } from 'vitest';
import {
  caminhoDossie,
  formatarDuracao,
  IMAGEM_PADRAO,
  IMAGEM_REDUZIDA,
  LIMITE_BYTES_DOSSIE,
  leituraDoCodigo,
  nomeArquivoDossie,
  normalizarCodigoDossie,
  ROTULO_LEITURA,
} from './dominio';

describe('dossiê de provas: domínio (extra)', () => {
  it('aceita só o formato DEV-000123 (normaliza maiúsculas e espaços)', () => {
    expect(normalizarCodigoDossie('DEV-000123')).toBe('DEV-000123');
    expect(normalizarCodigoDossie(' dev-000123 ')).toBe('DEV-000123');
    expect(normalizarCodigoDossie('DEV-1234567')).toBe('DEV-1234567');
    for (const ruim of ['', 'DEV-', 'DEV-12', 'LOT-000123', 'DEV-000123/../x', 'DEV-000123;', 'DEV-0001234567890']) {
      expect(normalizarCodigoDossie(ruim), ruim).toBeNull();
    }
  });

  it('caminho da rota e nome do arquivo baixado', () => {
    expect(caminhoDossie('DEV-000123')).toBe('/api/devolucoes/DEV-000123/dossie');
    expect(nomeArquivoDossie('DEV-000123')).toBe('dossie-DEV-000123.pdf');
  });

  it('limites: 8 MB; imagens a 1280 px/70 e, na 2ª tentativa, 1024 px/60', () => {
    expect(LIMITE_BYTES_DOSSIE).toBe(8 * 1024 * 1024);
    expect(IMAGEM_PADRAO).toEqual({ ladoMaior: 1280, qualidade: 70 });
    expect(IMAGEM_REDUZIDA).toEqual({ ladoMaior: 1024, qualidade: 60 });
  });

  it('leitura do código de barras: Confere, Não confere ou Não lido', () => {
    expect(leituraDoCodigo({ eanLido: '7891000000014', divergente: false })).toBe('confere');
    expect(leituraDoCodigo({ eanLido: '7891000000021', divergente: true })).toBe('nao_confere');
    expect(leituraDoCodigo({ eanLido: null, divergente: false })).toBe('nao_lido');
    expect(ROTULO_LEITURA).toEqual({ confere: 'Confere', nao_confere: 'Não confere', nao_lido: 'Não lido' });
  });

  it('duração do vídeo em minutos e segundos', () => {
    expect(formatarDuracao(0)).toBe('0:00');
    expect(formatarDuracao(42.4)).toBe('0:42');
    expect(formatarDuracao(65)).toBe('1:05');
    expect(formatarDuracao(3723)).toBe('1:02:03');
  });
});
