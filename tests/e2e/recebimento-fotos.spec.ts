import { eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { devolucoes, evidencias } from '../../src/db/schema';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral } from './apoio';
import { esperarEnviada, fotoDeTeste } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test('pacote não identificado: registra e já tira a Foto 1 e a Foto 2 (spec §6.2)', async ({ page }) => {
  const rastreio = codigoUnico('NIF');
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByLabel('Código de Rastreamento').fill(rastreio);
  await page.getByRole('button', { name: 'Registrar chegada' }).click();
  await page.getByRole('button', { name: 'Registrar pacote não identificado' }).click();
  await expect(page.getByRole('heading', { name: 'Fotos do pacote' })).toBeVisible();
  await semRolagemLateral(page);
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste('etiqueta.jpg'));
  await page.getByLabel('Tirar Foto 2', { exact: true }).setInputFiles(await fotoDeTeste('embalagem.jpg'));
  await esperarEnviada(page, 'Foto 1');
  await esperarEnviada(page, 'Foto 2');
  const tipos = await comBanco(async (db) => {
    const [d] = await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.rastreio, rastreio));
    return (await db.select({ tipo: evidencias.tipo }).from(evidencias).where(eq(evidencias.devolucaoId, d.id))).map((e) => e.tipo).sort();
  });
  expect(tipos).toEqual(['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM']);
});
