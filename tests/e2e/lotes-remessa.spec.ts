import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/universal';
import { regrasFiscais } from '../../src/db/schema';
import { paraArrayBuffer } from '../helpers/xlsx';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { prepararFiscal } from './apoio-fiscal';
import { prepararLote } from './apoio-lotes';
import { USUARIOS_E2E } from './dados';

/** O worker do e2e autoriza na 2ª consulta (uns 10 s); a página se atualiza a cada 5 s. */
const AUTORIZACAO = { timeout: 45_000 };

async function emitir(page: Page) {
  const nf = page.getByRole('region', { name: 'NF de Remessa' });
  await nf.getByRole('button', { name: 'Emitir NF de Remessa' }).click();
  return nf;
}

test('Emitir NF de Remessa → autorizada → lista consolidada (PDF e Excel) → envio → resultado → Finalizado', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  const lote = await prepararLote({ status: 'FECHADO', unidades: 2 });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/lotes/${lote.codigo}`);
  const retorno = page.locator('#retorno-lote');
  const nf = await emitir(page);
  await expect(retorno).toContainText('NF de Remessa enviada à SEFAZ.');
  await expect(nf.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(nf.getByTestId('chave-nf-remessa')).toHaveText(/^\d{44}$/);
  await expect(page.getByText('NF emitida', { exact: true }).first()).toBeVisible();
  await semRolagemLateral(page);

  const lista = page.getByRole('region', { name: 'Lista consolidada' });
  const pdf = page.waitForEvent('download');
  await lista.getByRole('link', { name: 'Baixar PDF' }).click();
  expect(readFileSync(await (await pdf).path()).subarray(0, 5).toString()).toBe('%PDF-');
  const excel = page.waitForEvent('download');
  await lista.getByRole('link', { name: 'Baixar Excel' }).click();
  const arquivo = await excel;
  expect(arquivo.suggestedFilename()).toBe(`lista-consolidada-${lote.codigo}.xlsx`);
  const linhas = (await readSheet(paraArrayBuffer(new Uint8Array(readFileSync(await arquivo.path()))))).flat().map(String);
  expect(linhas).toEqual(expect.arrayContaining([lote.fornecedor, lote.devolucaoCodigo, 'Avariado']));

  const envio = page.getByRole('region', { name: 'Registrar envio' });
  await envio.getByLabel('Código de rastreamento do envio').fill('BR123456789BR');
  await envio.getByRole('button', { name: 'Registrar envio' }).click();
  await expect(retorno).toContainText('Envio registrado.');
  await expect(page.getByRole('region', { name: 'Registrar envio' })).toHaveCount(0);

  const resultado = page.getByRole('region', { name: 'Registrar resultado' });
  await resultado.getByLabel(`Resultado do fornecedor (unidade 1 da ${lote.devolucaoCodigo})`).selectOption({ label: 'Consertado' });
  await resultado.getByLabel(`Resultado do fornecedor (unidade 2 da ${lote.devolucaoCodigo})`).selectOption({ label: 'Crédito' });
  await resultado.getByRole('button', { name: 'Registrar resultado' }).click();
  await expect(retorno).toContainText('Resultado registrado. Lote finalizado.');
  await expect(page.getByText('Finalizado', { exact: true }).first()).toBeVisible();
  await semRolagemLateral(page);
});

test('NF de Remessa rejeitada: corrigir a regra e reenviar; depois cancelar volta o lote para Fechado', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  await comBanco((db) => db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto REJEITAR' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO')));
  try {
    const lote = await prepararLote({ status: 'FECHADO' });
    await entrarComo(page, USUARIOS_E2E.gestor);
    await page.goto(`/lotes/${lote.codigo}`);
    const nf = await emitir(page);
    await expect(nf.getByText('NF rejeitada', { exact: true })).toBeVisible(AUTORIZACAO);
    await expect(nf.getByText(/Rejeição simulada/)).toBeVisible();

    await comBanco((db) => db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO')));
    await nf.getByRole('button', { name: 'Corrigir e reenviar' }).click();
    await expect(nf.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

    await nf.getByText('Cancelar esta NF').click();
    await nf.getByLabel('Justificativa (15 a 255 caracteres)').fill('Remessa emitida para o fornecedor errado');
    await nf.getByRole('button', { name: 'Cancelar NF' }).click();
    await expect(page.locator('#retorno-lote')).toContainText('NF de Remessa cancelada. O lote voltou para Fechado.');
    await expect(nf.getByRole('button', { name: 'Emitir NF de Remessa' })).toBeVisible();
  } finally {
    await prepararFiscal();
  }
});

test('Operador não baixa a lista consolidada (spec §6.9)', async ({ page }) => {
  const lote = await prepararLote({ status: 'FECHADO' });
  await entrarComo(page, USUARIOS_E2E.operador);
  const resposta = await page.request.get(`/api/lotes/${lote.codigo}/lista-consolidada?formato=pdf`);
  expect(resposta.status()).toBe(404);
});
