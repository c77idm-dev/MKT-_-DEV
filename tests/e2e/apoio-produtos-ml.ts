import { expect, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { produtos } from '../../src/db/schema';
import { comBanco } from './apoio';

/**
 * Produtos do ML (extra): as fotos dos anúncios do ML falso são de um domínio reservado (.example), que nunca carrega.
 * O e2e responde a imagem aqui (sem rede) ou a recusa, para ver o ícone de "sem foto". Use com
 * `test.use({ serviceWorkers: 'block' })`, para o service worker do PWA não ficar entre a página e o page.route.
 */
export const HOST_FOTOS_ML_FALSO = 'https://imagens.ml-falso.example';
export const FOTO_FONE_FALSO = `${HOST_FOTOS_ML_FALSO}/mlf-fone-01.png`;
export const TITULO_FONE_FALSO = 'Fone de Ouvido Bluetooth MLF';

let png: Buffer | null = null;

export async function responderFotosML(page: Page): Promise<void> {
  png ??= await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 15, g: 118, b: 110 } } }).png().toBuffer();
  const corpo = png;
  await page.route(`${HOST_FOTOS_ML_FALSO}/**`, (rota) => rota.fulfill({ status: 200, contentType: 'image/png', body: corpo }));
}

export async function recusarFotosML(page: Page): Promise<void> {
  await page.route(`${HOST_FOTOS_ML_FALSO}/**`, (rota) => rota.abort('connectionrefused'));
}

/** A imagem carregou de verdade (não é uma imagem quebrada). */
export async function fotoCarregada(foto: Locator): Promise<void> {
  await expect(foto).toBeVisible();
  await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}

/** O produto que a sincronização cadastrou pelo anúncio do ML falso. */
export async function produtoDoSku(sku: string) {
  return comBanco(async (db) => {
    const [p] = await db.select().from(produtos).where(eq(produtos.sku, sku));
    return p ?? null;
  });
}
