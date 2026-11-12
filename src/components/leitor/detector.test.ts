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
    const detector = await criarDetector({ BarcodeDetector: construtorFalso(['BR123'], ['code_128', 'qr_code']) }, alternativa);
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
  it('explica em português o que fazer', () => {
    const bloqueada = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    expect(mensagemErroCamera(bloqueada)).toBe('A câmera foi bloqueada. Libere o acesso à câmera no navegador ou digite o código.');
    expect(mensagemErroCamera(new Error('qualquer'))).toBe('Não foi possível abrir a câmera. Digite o código.');
  });
});
