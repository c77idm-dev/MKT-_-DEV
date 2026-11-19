import { Readable } from 'node:stream';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { IMAGEM_PADRAO, IMAGEM_REDUZIDA } from './dominio';
import { reduzirImagem } from './imagens';

/** Foto com ruído (não comprime fácil, como uma foto de verdade) e EXIF. */
async function foto(largura: number, altura: number): Promise<Buffer> {
  const ruido = Buffer.alloc(largura * altura * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 7919) % 251;
  return sharp(ruido, { raw: { width: largura, height: altura, channels: 3 } })
    .jpeg({ quality: 90 })
    .withExif({ IFD0: { Artist: 'Fulano', Copyright: 'teste' } })
    .toBuffer();
}

describe('reduzirImagem (dossiê)', () => {
  it('leva o maior lado a 1280 px, em JPEG, sem EXIF', async () => {
    const r = await reduzirImagem(await foto(4000, 3000), IMAGEM_PADRAO);
    expect({ largura: r.largura, altura: r.altura }).toEqual({ largura: 1280, altura: 960 });
    const meta = await sharp(r.jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1280);
    expect(meta.exif).toBeUndefined();
  });

  it('foto em pé também: o maior lado é a altura', async () => {
    const r = await reduzirImagem(await foto(1500, 2000), IMAGEM_PADRAO);
    expect({ largura: r.largura, altura: r.altura }).toEqual({ largura: 960, altura: 1280 });
  });

  it('1024 px e qualidade 60 dão um arquivo menor', async () => {
    const original = await foto(2000, 1500);
    const padrao = await reduzirImagem(original, IMAGEM_PADRAO);
    const reduzida = await reduzirImagem(original, IMAGEM_REDUZIDA);
    expect(reduzida.largura).toBe(1024);
    expect(reduzida.jpeg.length).toBeLessThan(padrao.jpeg.length);
  });

  it('não amplia foto pequena', async () => {
    const r = await reduzirImagem(await foto(800, 600), IMAGEM_PADRAO);
    expect({ largura: r.largura, altura: r.altura }).toEqual({ largura: 800, altura: 600 });
  });

  it('lê de um stream (o armazenamento entrega Readable)', async () => {
    const r = await reduzirImagem(Readable.from([await foto(1600, 1200)]), IMAGEM_PADRAO);
    expect(r.largura).toBe(1280);
  });

  it('recusa o que não é imagem', async () => {
    await expect(reduzirImagem(Buffer.from('não sou uma foto'), IMAGEM_PADRAO)).rejects.toThrow();
    await expect(reduzirImagem(Readable.from([Buffer.from('nada')]), IMAGEM_PADRAO)).rejects.toThrow();
  });
});
