import sharp from 'sharp';
import type { OpcoesImagem } from './dominio';

// A VPS tem uma vCPU: sem cache e uma imagem por vez, como no worker (carimbo.ts).
sharp.cache(false);
sharp.concurrency(1);

export type ImagemPdf = { jpeg: Buffer; largura: number; altura: number };

const ENTRADA = { failOn: 'error', limitInputPixels: 50_000_000 } as const;

/**
 * Cópia reduzida para o PDF: maior lado em `ladoMaior` (sem ampliar), JPEG na `qualidade` dada e sem metadados.
 * Só aceita a foto já inteira na memória: com um stream na entrada, um erro no meio da leitura deixava o sharp sem
 * resolver nem rejeitar (o toBuffer espera um 'finish' que não vem), e o dossiê ficava pendurado (midias.ts lê antes).
 */
export async function reduzirImagem(entrada: Buffer, o: OpcoesImagem): Promise<ImagemPdf> {
  const { data, info } = await sharp(entrada, ENTRADA)
    .autoOrient()
    .resize({ width: o.ladoMaior, height: o.ladoMaior, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: o.qualidade, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, largura: info.width, altura: info.height };
}
