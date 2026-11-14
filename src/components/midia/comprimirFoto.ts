/** Spec §9: JPEG com cerca de 1600 px no maior lado e ~400 KB, feito no celular antes do envio. */
export const LADO_MAIOR_FOTO = 1600;

export function dimensoesAlvo(largura: number, altura: number, ladoMaior = LADO_MAIOR_FOTO): { largura: number; altura: number } {
  const escala = Math.min(1, ladoMaior / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

async function paraJpeg(canvas: OffscreenCanvas | HTMLCanvasElement, qualidade: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: qualidade });
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('toBlob falhou'))), 'image/jpeg', qualidade));
}

/**
 * createImageBitmap aplica a orientação do EXIF ('from-image') e já reduz a imagem (sem desenhar 48 MP no canvas do
 * iPhone); o JPEG que sai do canvas não tem EXIF (sem GPS). Pesquisa §2.
 */
export async function comprimirFoto(arquivo: Blob): Promise<Blob> {
  const original = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const alvo = dimensoesAlvo(original.width, original.height);
  original.close();
  const bitmap = await createImageBitmap(arquivo, {
    imageOrientation: 'from-image',
    resizeWidth: alvo.largura,
    resizeHeight: alvo.altura,
    resizeQuality: 'high',
  });
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(alvo.largura, alvo.altura)
      : Object.assign(document.createElement('canvas'), { width: alvo.largura, height: alvo.altura });
  const contexto = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!contexto) throw new Error('Este navegador não consegue preparar a foto.');
  contexto.drawImage(bitmap, 0, 0);
  bitmap.close();
  const foto = await paraJpeg(canvas, 0.8);
  return foto.size > 600_000 ? paraJpeg(canvas, 0.7) : foto;
}
