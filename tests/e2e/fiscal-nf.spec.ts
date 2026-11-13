import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { EMPRESA_TESTE, inserirNotaVendaTeste } from '../helpers/fabricas-fiscal';
import { xmlNotaVendaTeste } from '../helpers/xml-nfe';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral } from './apoio';
import { devolucaoNoEstoque, prepararFiscal } from './apoio-fiscal';
import { USUARIOS_E2E } from './dados';

/** O worker do e2e autoriza na 2ª consulta (uns 10 s); a página se atualiza a cada 5 s. */
const AUTORIZACAO = { timeout: 45_000 };

test('Fiscal anexa o XML da NF de venda, escolhe o item (D14) e emite; a NF é autorizada, o DANFE abre e o ZIP traz o XML', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'], comNotaVenda: false });
  const { xml, chave: chaveVenda } = xmlNotaVendaTeste({
    cnpjEmitente: EMPRESA_TESTE.cnpj,
    itens: [{ codigo: codigoUnico('VENDA'), descricao: 'Fone de teste', valorUnitario: 80 }],
  });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await expect(secao.getByText('Nenhuma NF de venda.')).toBeVisible();

  await secao.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await secao.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(secao.getByRole('status')).toHaveText('NF de venda anexada.');
  await expect(secao.getByText(chaveVenda)).toBeVisible();

  // D14: o SKU da devolução não está na NF de venda, então o Fiscal escolhe o item.
  await expect(secao.getByText(/Sem item da NF de venda: escolha abaixo/)).toBeVisible();
  await secao.getByLabel('Item da NF de venda (unidade 1)').selectOption({ index: 1 });
  await secao.getByRole('button', { name: /^Salvar escolha/ }).click();
  await expect(secao.getByText(/Escolhido pelo Fiscal/)).toBeVisible();
  await semRolagemLateral(page);

  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(page.getByText('Concluída', { exact: true }).first()).toBeVisible();
  const chave = ((await secao.getByTestId('chave-nf-devolucao').textContent()) ?? '').trim();
  expect(chave).toMatch(/^\d{44}$/);
  const danfe = await secao.getByRole('link', { name: 'Abrir DANFE (PDF)' }).getAttribute('href');
  const resposta = await page.request.get(danfe ?? '');
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toContain('application/pdf');
  await semRolagemLateral(page);

  // Spec §8.7: o ZIP do mês traz o XML desta nota.
  await page.goto('/fluxo/etapa/4');
  const xmls = page.locator('details', { hasText: 'Baixar XMLs do período' });
  await xmls.getByText('Baixar XMLs do período').click();
  const download = page.waitForEvent('download');
  await xmls.getByRole('button', { name: 'Baixar XMLs' }).click();
  const arquivo = await download;
  const zip = unzipSync(new Uint8Array(readFileSync(await arquivo.path())));
  expect(Object.keys(zip)).toContain(`${chave}-nfe.xml`);
});

test('Fiscal remove a NF de venda só depois de confirmar', async ({ page }) => {
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'], comNotaVenda: false });
  const { xml } = xmlNotaVendaTeste({
    cnpjEmitente: EMPRESA_TESTE.cnpj,
    itens: [{ codigo: codigoUnico('VENDA'), descricao: 'Fone de teste', valorUnitario: 80 }],
  });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await secao.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await secao.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(secao.getByRole('status')).toHaveText('NF de venda anexada.');

  // Um toque não apaga nada: é preciso abrir a confirmação.
  await expect(secao.getByRole('button', { name: /^Remover NF de venda/ })).toBeHidden();
  await secao.getByText('Remover esta NF de venda').click();
  await expect(secao.getByText('O XML e as escolhas de item desta nota serão apagados.')).toBeVisible();
  await secao.getByRole('button', { name: /^Remover NF de venda/ }).click();
  await expect(secao.getByRole('status')).toHaveText('NF de venda removida.');
  await expect(secao.getByText('Nenhuma NF de venda.')).toBeVisible();
  await semRolagemLateral(page);
});

test('Fiscal troca o item da NF de venda de uma unidade já casada pelo SKU', async ({ page }) => {
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'], comNotaVenda: false });
  await comBanco((db) =>
    inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: dev.sku, descricao: 'Casado' }, { codigo: codigoUnico('OUTRO'), descricao: 'Outro item' }] }),
  );
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await expect(secao.getByText(/Casado pelo SKU/)).toBeVisible();
  await secao.getByText('Trocar o item da NF de venda').click();
  await secao.getByLabel('Item da NF de venda (unidade 1)').selectOption({ index: 2 });
  await secao.getByRole('button', { name: /^Salvar escolha/ }).click();
  await expect(secao.getByText(/Escolhido pelo Fiscal/)).toBeVisible();
  await semRolagemLateral(page);
});

test('Gestor corrige a regra depois da rejeição e reenvia a mesma NF', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal({ naturezas: { DENTRO_ESTADO: 'Devolucao de venda REJEITAR' } });
  try {
    const dev = await devolucaoNoEstoque({ destinos: ['PROBLEMA'] });
    await entrarComo(page, USUARIOS_E2E.gestor);
    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    const secao = page.getByRole('region', { name: 'Fiscal' });
    await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
    await expect(secao.getByText('NF rejeitada', { exact: true })).toBeVisible(AUTORIZACAO);
    await expect(secao.getByText(/Rejeição simulada: a natureza da operação contém REJEITAR/)).toBeVisible();

    await page.goto('/configuracoes/fiscal/regras/DEVOLUCAO_VENDA/DENTRO_ESTADO');
    await page.getByLabel('Natureza da operação').fill('Devolucao de venda');
    await page.getByRole('button', { name: 'Salvar regra' }).click();
    await expect(page.getByRole('status')).toHaveText('Regra fiscal salva.');

    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    await page.getByRole('region', { name: 'Fiscal' }).getByRole('button', { name: 'Corrigir e reenviar' }).click();
    await expect(page.getByRole('region', { name: 'Fiscal' }).getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
    await semRolagemLateral(page);
  } finally {
    await prepararFiscal();
  }
});

test('Fiscal cancela a NF em até 24 h e a devolução volta para Aguardando NF', async ({ page }) => {
  test.setTimeout(150_000);
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);

  await secao.getByText('Cancelar esta NF').click();
  await secao.getByLabel('Justificativa (15 a 255 caracteres)').fill('Cliente desistiu da devolução');
  await secao.getByRole('button', { name: 'Cancelar NF' }).click();
  await expect(secao.getByText('NF cancelada. A devolução voltou para Aguardando NF.')).toBeVisible();
  await expect(page.getByText('Aguardando NF', { exact: true }).first()).toBeVisible();
  await expect(secao.getByRole('button', { name: 'Emitir NF de devolução' })).toBeVisible();
  await expect(secao.getByText(/cancelada em .*: Cliente desistiu da devolução/)).toBeVisible();
  await semRolagemLateral(page);
});

test('o Operador vê a Seção Fiscal sem botões de ação', async ({ page }) => {
  await prepararFiscal();
  const dev = await devolucaoNoEstoque({ destinos: ['BOM'] });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await expect(secao.getByRole('heading', { name: 'NF de venda', exact: true })).toBeVisible();
  await expect(secao.getByRole('button')).toHaveCount(0);
  await expect(secao.getByLabel('Arquivo XML da NF de venda')).toHaveCount(0);
  await semRolagemLateral(page);
});
