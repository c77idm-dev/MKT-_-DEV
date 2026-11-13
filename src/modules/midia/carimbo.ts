import sharp from 'sharp';
import { formatarDataHora } from '@/lib/formatar';

// Worker numa vCPU: sem cache e uma imagem por vez (pesquisa §8, memória do sharp com glibc).
sharp.cache(false);
sharp.concurrency(1);

/** Spec §9: ~1600 px no maior lado. */
export const LADO_MAIOR = 1600;

/** "12/11/2026 14:03 · DEV-000123 · Ana Souza": hora de Brasília em que o servidor recebeu (decisão 6). */
export function textoCarimbo(p: { quando: Date; codigo: string; usuario: string }): string {
  return `${formatarDataHora(p.quando)} · ${p.codigo} · ${p.usuario}`;
}

export function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Faixa escura na base, com o texto em branco. A fonte é proporcional e encolhe para o texto caber na largura. */
export function svgCarimbo(largura: number, altura: number, texto: string): string {
  const fonte = Math.max(10, Math.min(Math.round(altura * 0.028), Math.floor(largura / (texto.length * 0.62))));
  const faixa = Math.min(altura, Math.round(fonte * 2));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${faixa}">` +
    `<rect width="100%" height="100%" fill="#000000" fill-opacity="0.6"/>` +
    `<text x="${Math.round(fonte * 0.6)}" y="${Math.round(faixa * 0.68)}" font-family="DejaVu Sans, Arial, sans-serif" ` +
    `font-size="${fonte}" fill="#ffffff">${escaparXml(texto)}</text></svg>`
  );
}

export async function carimbarFoto(
  entrada: Buffer,
  p: { quando: Date; codigo: string; usuario: string },
): Promise<{ conteudo: Buffer; largura: number; altura: number }> {
  const { data, info } = await sharp(entrada, { failOn: 'error' })
    .autoOrient()
    .resize({ width: LADO_MAIOR, height: LADO_MAIOR, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const svg = svgCarimbo(info.width, info.height, textoCarimbo(p));
  // Sem withMetadata(): o JPEG final sai sem EXIF (nem GPS).
  const conteudo = await sharp(data)
    .composite([{ input: Buffer.from(svg), gravity: 'south' }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { conteudo, largura: info.width, altura: info.height };
}
