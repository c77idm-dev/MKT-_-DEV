import { describe, expect, it } from 'vitest';
import {
  caminhoDossie,
  cookieDossiePronto,
  ehMarcaDossie,
  formatarDuracao,
  IMAGEM_PADRAO,
  IMAGEM_REDUZIDA,
  LIMITE_BYTES_DOSSIE,
  leituraDoCodigo,
  MAX_FOTOS_DOSSIE,
  opcoesIniciais,
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

  it('marca do toque no botão: 16 hexadecimais, vai na query e vira o nome do cookie', () => {
    expect(caminhoDossie('DEV-000123', '0123456789abcdef')).toBe('/api/devolucoes/DEV-000123/dossie?n=0123456789abcdef');
    expect(cookieDossiePronto('0123456789abcdef')).toBe('dossie_0123456789abcdef');
    expect(ehMarcaDossie('0123456789abcdef')).toBe(true);
    for (const ruim of [null, undefined, '', '0123', '0123456789ABCDEF', '0123456789abcdeg', 'x; Path=/; a=0123456789abcdef']) {
      expect(ehMarcaDossie(ruim), String(ruim)).toBe(false);
    }
  });

  it('limites: 8 MB; imagens a 1280 px/70 e, na 2ª tentativa, 1024 px/60', () => {
    expect(LIMITE_BYTES_DOSSIE).toBe(8 * 1024 * 1024);
    expect(IMAGEM_PADRAO).toEqual({ ladoMaior: 1280, qualidade: 70 });
    expect(IMAGEM_REDUZIDA).toEqual({ ladoMaior: 1024, qualidade: 60 });
    expect(MAX_FOTOS_DOSSIE).toBe(120);
  });

  it('qualidade escolhida antes da 1ª passada: ~170 KB por imagem; acima do limite já começa reduzida', () => {
    expect(opcoesIniciais(9, LIMITE_BYTES_DOSSIE)).toEqual(IMAGEM_PADRAO);
    expect(opcoesIniciais(48, LIMITE_BYTES_DOSSIE)).toEqual(IMAGEM_PADRAO);
    expect(opcoesIniciais(49, LIMITE_BYTES_DOSSIE)).toEqual(IMAGEM_REDUZIDA);
    expect(opcoesIniciais(121, LIMITE_BYTES_DOSSIE)).toEqual(IMAGEM_REDUZIDA);
    expect(opcoesIniciais(0, 1)).toEqual(IMAGEM_PADRAO);
  });

  it('leitura do código de barras: Confere, Não confere, Não lido ou sem referência para comparar', () => {
    const produto = { descricao: 'Fone', eanEsperado: '7891000000014' };
    expect(leituraDoCodigo({ ...produto, eanLido: '7891000000014', divergente: false })).toBe('confere');
    expect(leituraDoCodigo({ ...produto, eanLido: '7891000000021', divergente: true })).toBe('nao_confere');
    expect(leituraDoCodigo({ ...produto, eanLido: null, divergente: false })).toBe('nao_lido');
    // O produto esperado não tem EAN no cadastro: a tela diz "confira pela descrição"; nada foi comparado.
    expect(leituraDoCodigo({ descricao: 'Fone', eanEsperado: null, eanLido: '7891000000014', divergente: false })).toBe('sem_referencia');
    // Sem EAN, mas o lido é de outro produto do cadastro: a conferência marcou divergente.
    expect(leituraDoCodigo({ descricao: 'Fone', eanEsperado: null, eanLido: '7891000000021', divergente: true })).toBe('nao_confere');
    // SKU fora do cadastro: com ou sem produto achado pelo EAN, a conferência não teve com o que comparar.
    expect(leituraDoCodigo({ descricao: null, eanEsperado: null, eanLido: '7891000000014', divergente: false })).toBe('sem_referencia');
    expect(leituraDoCodigo({ descricao: null, eanEsperado: null, eanLido: '7891000000021', divergente: true })).toBe('sem_referencia');
    expect(leituraDoCodigo({ descricao: null, eanEsperado: null, eanLido: null, divergente: false })).toBe('nao_lido');
    expect(ROTULO_LEITURA).toEqual({
      confere: 'Confere',
      nao_confere: 'Não confere',
      nao_lido: 'Não lido',
      sem_referencia: 'Sem EAN de referência no cadastro (não comparado)',
    });
  });

  it('duração do vídeo em minutos e segundos', () => {
    expect(formatarDuracao(0)).toBe('0:00');
    expect(formatarDuracao(42.4)).toBe('0:42');
    expect(formatarDuracao(65)).toBe('1:05');
    expect(formatarDuracao(3723)).toBe('1:02:03');
  });
});
