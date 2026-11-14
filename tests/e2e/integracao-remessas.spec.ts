import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { readSheet } from 'read-excel-file/universal';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { EMPRESA_TESTE } from '../helpers/fabricas-fiscal';
import { criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../helpers/fabricas-lotes';
import { paraArrayBuffer } from '../helpers/xlsx';
import { xmlNotaVendaTeste } from '../helpers/xml-nfe';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { conferirDevolucao, EAN_TESTE } from './apoio-conferencia';
import { prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

const AUTORIZACAO = { timeout: 45_000 };

test('spec §12: recebimento → conferência → NF de devolução → lote → NF de Remessa → lista consolidada → envio → resultado → Finalizado', async ({ page }) => {
  test.setTimeout(360_000);
  await prepararFiscal();
  const sku = codigoUnico('REM');
  const rastreio = codigoUnico('REMR');
  const { dev, fornecedor } = await comBanco(async (db) => {
    const f = await criarFornecedorCompletoTeste(db, { razaoSocial: codigoUnico('Fornecedor Integracao') });
    await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj, sku, ean: EAN_TESTE });
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return { dev: await criarDevolucaoTeste(db, operador, { rastreio, itens: [{ sku, quantidade: 2 }] }), fornecedor: f };
  });

  // Etapa 2: chegada pela tela de Recebimento.
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(rastreio);
  await campo.press('Enter');
  await expect(page.getByRole('status')).toContainText('Chegada registrada');

  // Etapa 3: conferência pela tela (Fotos 1 a 4 e Vídeo de Prova): unidade 1 Bom, unidade 2 Problema (Avariado).
  await conferirDevolucao(page, dev.codigo, ['BOM', { problema: 'AVARIADO' }]);

  // Etapa 4: NF de venda anexada e NF de devolução autorizada (emissor falso).
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const fiscal = page.getByRole('region', { name: 'Fiscal' });
  const { xml } = xmlNotaVendaTeste({ cnpjEmitente: EMPRESA_TESTE.cnpj, itens: [{ codigo: sku, quantidade: 2, valorUnitario: 60 }] });
  await fiscal.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await fiscal.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(fiscal.getByText('NF de venda anexada.')).toBeVisible();
  await fiscal.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(fiscal.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

  // Etapa 5: a unidade com problema entrou sozinha no lote ABERTO do fornecedor.
  await page.reload();
  const secaoLote = page.getByRole('region', { name: 'Lote' });
  const linkLote = secaoLote.getByRole('link', { name: /LOT-\d{6}/ });
  const codigoLote = ((await linkLote.textContent()) ?? '').match(/LOT-\d{6,}/)?.[0] ?? '';
  expect(codigoLote).not.toBe('');
  await linkLote.click();
  await expect(page.getByRole('heading', { name: codigoLote, level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unidades' })).toContainText('Avariado');
  await semRolagemLateral(page);

  // Fechar lote → Emitir NF de Remessa.
  const fechar = page.getByRole('region', { name: 'Fechar lote' });
  await fechar.getByRole('radio', { name: 'Conserto' }).check();
  await fechar.getByRole('button', { name: 'Fechar lote' }).click();
  await expect(page.getByText('Lote fechado.')).toBeVisible();
  const nf = page.getByRole('region', { name: 'NF de Remessa' });
  await nf.getByRole('button', { name: 'Emitir NF de Remessa' }).click();
  await expect(nf.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

  // Lista consolidada (Excel): fornecedor, devolução e motivo.
  const download = page.waitForEvent('download');
  await page.getByRole('region', { name: 'Lista consolidada' }).getByRole('link', { name: 'Baixar Excel' }).click();
  const celulas = (await readSheet(paraArrayBuffer(new Uint8Array(readFileSync(await (await download).path()))))).flat().map(String);
  expect(celulas).toEqual(expect.arrayContaining([fornecedor.razaoSocial, dev.codigo, 'Avariado', codigoLote]));

  // Registrar envio → Registrar resultado → Finalizado.
  await page.getByLabel('Código de rastreamento do envio').fill('BR987654321BR');
  await page.getByRole('button', { name: 'Registrar envio' }).click();
  await expect(page.getByText('Envio registrado.')).toBeVisible();
  await page.getByLabel(`Resultado do fornecedor (unidade 2 da ${dev.codigo})`).selectOption({ label: 'Consertado' });
  await page.getByRole('button', { name: 'Registrar resultado' }).click();
  await expect(page.getByText('Resultado registrado. Lote finalizado.')).toBeVisible();

  // A devolução mostra o resultado; o lote finalizado sai da coluna 5.
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  await expect(page.getByRole('region', { name: 'Lote' })).toContainText('Consertado');
  await page.goto('/fluxo?etapa=5');
  await expect(page.getByRole('link', { name: new RegExp(`^${codigoLote}`) })).toHaveCount(0);
  await semRolagemLateral(page);
});
