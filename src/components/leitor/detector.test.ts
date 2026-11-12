import { describe, expect, it, vi } from 'vitest';
import { criarDetector, mensagemErroCamera, type ConstrutorDetector } from './detector';

function construtorFalso(lidos: string[], suportados?: string[]): ConstrutorDetector {
  class Falso {
    static getSupportedFormats = suportados ? async () => suportados : undefined;
    async detect() {
      return lidos.map((rawValue) => ({ rawValue }));
    }
  }
  return Falso as unknown as ConstrutorDetector;
}

const VIDEO = {} as ImageBitmapSource;

describe('criarDetector', () => {
  it('usa o BarcodeDetector do navegador quando ele lê Code 128', async () => {
    const alternativa = vi.fn();
    const detector = await criarDetector({ BarcodeDetector: construtorFalso(['BR123'], ['code_128', 'qr_code', 'data_matrix', 'ean_13']) }, alternativa);
    expect(detector.origem).toBe('nativo');
    expect(alternativa).not.toHaveBeenCalled();
    expect(await detector.detectar(VIDEO)).toBe('BR123');
  });

  it('usa o ZXing quando o navegador não tem o BarcodeDetector (iPhone)', async () => {
    const alternativa = vi.fn(async () => construtorFalso([' BR999 ']));
    const detector = await criarDetector({}, alternativa);
    expect(detector.origem).toBe('zxing');
    expect(alternativa).toHaveBeenCalledOnce();
    expect(await detector.detectar(VIDEO)).toBe('BR999');
  });

  it('usa o ZXing quando o nativo lê Code 128 mas não todos os formatos exigidos', async () => {
    const detector = await criarDetector(
      { BarcodeDetector: construtorFalso([], ['code_128', 'qr_code', 'ean_13']) },
      async () => construtorFalso([]),
    );
    expect(detector.origem).toBe('zxing');
  });

  it('usa o ZXing quando o nativo não lê Code 128', async () => {
    const detector = await criarDetector({ BarcodeDetector: construtorFalso([], ['qr_code']) }, async () => construtorFalso([]));
    expect(detector.origem).toBe('zxing');
  });

  it('devolve null quando não lê nada e ignora leituras vazias', async () => {
    const detector = await criarDetector({}, async () => construtorFalso(['  ']));
    expect(await detector.detectar(VIDEO)).toBeNull();
  });
});

describe('mensagemErroCamera', () => {
  const erro = (nome: string) => Object.assign(new Error('x'), { name: nome });

  it('explica em português o que fazer', () => {
    expect(mensagemErroCamera(erro('NotAllowedError'))).toBe('A câmera foi bloqueada. Libere o acesso à câmera no navegador ou digite o código.');
    expect(mensagemErroCamera(erro('SecurityError'))).toBe('A câmera foi bloqueada. Libere o acesso à câmera no navegador ou digite o código.');
    expect(mensagemErroCamera(erro('NotFoundError'))).toBe('Nenhuma câmera encontrada neste aparelho. Digite o código.');
    expect(mensagemErroCamera(erro('OverconstrainedError'))).toBe('Nenhuma câmera encontrada neste aparelho. Digite o código.');
    expect(mensagemErroCamera(erro('NotReadableError'))).toBe('A câmera está em uso por outro aplicativo. Feche-o ou digite o código.');
    expect(mensagemErroCamera(new Error('qualquer'))).toBe('Não foi possível abrir a câmera. Digite o código.');
    expect(mensagemErroCamera('texto')).toBe('Não foi possível abrir a câmera. Digite o código.');
  });
});
