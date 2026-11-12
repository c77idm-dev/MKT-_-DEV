/**
 * Leitura de código de barras e QR (spec §4.2): o BarcodeDetector do navegador quando ele existe e lê Code 128;
 * senão, o ZXing em WebAssembly (pacote barcode-detector, mesma interface). O .wasm é servido em /zxing/.
 */
export const FORMATOS = [
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix',
  'pdf417',
] as const;

/** O leitor do navegador só serve se lê todos estes; senão o ZXing (que lê todos) assume. */
const OBRIGATORIOS = ['code_128', 'qr_code', 'data_matrix', 'ean_13'] as const;

type CodigoDetectado = { rawValue: string };

export type ConstrutorDetector = {
  new (opcoes?: { formats?: string[] }): { detect(fonte: ImageBitmapSource): Promise<CodigoDetectado[]> };
  getSupportedFormats?: () => Promise<readonly string[]>;
};

export type Detector = { origem: 'nativo' | 'zxing'; detectar(fonte: ImageBitmapSource): Promise<string | null> };

async function carregarZxing(): Promise<ConstrutorDetector> {
  const modulo = await import('barcode-detector/ponyfill');
  modulo.prepareZXingModule({
    overrides: {
      locateFile: (caminho: string, prefixo: string) => (caminho.endsWith('.wasm') ? `/zxing/${caminho}` : prefixo + caminho),
    },
  });
  return modulo.BarcodeDetector as unknown as ConstrutorDetector;
}

function embrulhar(origem: Detector['origem'], leitor: InstanceType<ConstrutorDetector>): Detector {
  return {
    origem,
    async detectar(fonte) {
      const achados = await leitor.detect(fonte);
      return achados.map((a) => a.rawValue.trim()).find((valor) => valor !== '') ?? null;
    },
  };
}

export async function criarDetector(
  ambiente: { BarcodeDetector?: ConstrutorDetector } = globalThis as unknown as { BarcodeDetector?: ConstrutorDetector },
  carregarAlternativa: () => Promise<ConstrutorDetector> = carregarZxing,
): Promise<Detector> {
  const Nativo = ambiente.BarcodeDetector;
  if (Nativo) {
    const suportados = (await Nativo.getSupportedFormats?.().catch(() => [])) ?? [];
    const formatos = FORMATOS.filter((f) => suportados.includes(f));
    if (OBRIGATORIOS.every((f) => formatos.includes(f))) return embrulhar('nativo', new Nativo({ formats: [...formatos] }));
  }
  const Alternativa = await carregarAlternativa();
  return embrulhar('zxing', new Alternativa({ formats: [...FORMATOS] }));
}

export function mensagemErroCamera(erro: unknown): string {
  const nome = erro instanceof Error ? erro.name : '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'A câmera foi bloqueada. Libere o acesso à câmera no navegador ou digite o código.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho. Digite o código.';
  if (nome === 'NotReadableError') return 'A câmera está em uso por outro aplicativo. Feche-o ou digite o código.';
  return 'Não foi possível abrir a câmera. Digite o código.';
}
