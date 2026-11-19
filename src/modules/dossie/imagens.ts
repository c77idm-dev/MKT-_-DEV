import type { Readable } from 'node:stream';
import sharp from 'sharp';
import type { OpcoesImagem } from './dominio';

// A VPS tem uma vCPU: sem cache e uma imagem por vez, como no worker (carimbo.ts).
sharp.cache(false);
sharp.concurrency(1);

export type ImagemPdf = { jpeg: Buffer; largura: number; altura: number };

const ENTRADA = { failOn: 'error', limitInputPixels: 50_000_000 } as const;

/**
 * Cópia reduzida para o PDF: maior lado em `ladoMaior` (sem ampliar), JPEG na `qualidade` dada e sem metadados.
 * Aceita o stream do armazenamento (a foto não precisa ficar inteira na memória antes do sharp).
 */
export async function reduzirImagem(entrada: Buffer | Readable, o: OpcoesImagem): Promise<ImagemPdf> {
  const fluxo = Buffer.isBuffer(entrada) ? sharp(entrada, ENTRADA) : sharp(ENTRADA);
  const saida = fluxo
    .autoOrient()
    .resize({ width: o.ladoMaior, height: o.ladoMaior, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: o.qualidade, mozjpeg: true });
  if (!Buffer.isBuffer(entrada)) {
    entrada.on('error', (erro) => saida.destroy(erro));
    entrada.pipe(saida);
  }
  const { data, info } = await saida.toBuffer({ resolveWithObject: true });
  return { jpeg: data, largura: info.width, altura: info.height };
}
