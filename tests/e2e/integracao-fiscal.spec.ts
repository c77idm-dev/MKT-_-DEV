/**
 * Contrato §7.3 (Fase 4, já com as Fases 2 e 3 no `main`), com os falsos: recebimento pela tela (Fase 1) → conferência
 * pela tela (Fase 2, `conferirDevolucao`, E11) → Estoque Bom e Estoque Problema → NF de devolução autorizada (emissor
 * falso) → cancelamento → nova NF; e NF de venda buscada no ML falso (Fase 3) → rejeição → corrigir e reenviar.
 */
import { expect, test } from '@playwright/test';
import { idReclamacaoFalsa, idsDaReclamacaoFalsa } from '../../src/conectores/marketplace/mercadolivre/falso';
import { obterConector } from '../../src/conectores/marketplace/registro';
import { configuracoes } from '../../src/db/schema';
import { interpretarXmlNotaVenda } from '../../src/modules/fiscal/xml-nota-venda';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { criarDevolucaoNoEstoqueTeste, EMPRESA_TESTE } from '../helpers/fabricas-fiscal';
import { xmlNotaVendaTeste } from '../helpers/xml-nfe';
import { codigoUnico, comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { conferirDevolucao } from './apoio-conferencia';
import { prepararFiscal } from './apoio-fiscal';
import { emModoFalso, garantirContaFalsa } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

const AUTORIZACAO = { timeout: 45_000 };

test('jornada entre as fases: recebimento → conferência → Estoque Bom e Estoque Problema → NF autorizada → cancelamento → nova NF', async ({ page }) => {
  test.setTimeout(240_000);
  await prepararFiscal();
  const sku = codigoUnico('INT');
  const rastreio = codigoUnico('INTR');
  const dev = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return criarDevolucaoTeste(db, operador, { rastreio, itens: [{ sku, quantidade: 2 }] });
  });

  // Etapa 2 do PDF: o Operador registra a chegada pela tela de Recebimento.
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  const campo = page.getByLabel('Código de Rastreamento');
  await campo.fill(rastreio);
  await campo.press('Enter');
  await expect(page.getByRole('status')).toContainText('Chegada registrada');

  // Etapa 3: a conferência da Fase 2, pela tela, deixa uma unidade em Estoque Bom e outra em Estoque Problema.
  await conferirDevolucao(page, dev.codigo, ['BOM', { problema: 'AVARIADO' }]);

  // Etapa 4: a devolução aparece nas duas abas.
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await page.goto('/fluxo/etapa/4');
  await expect(page.getByRole('link', { name: new RegExp(dev.codigo) })).toContainText('Estoque Bom: 1');
  await page.goto('/fluxo/etapa/4/problema');
  await expect(page.getByRole('link', { name: new RegExp(dev.codigo) })).toContainText('Estoque Problema: 1');
  await semRolagemLateral(page);

  // NF de venda anexada, NF de devolução emitida e autorizada.
  const { xml } = xmlNotaVendaTeste({ cnpjEmitente: EMPRESA_TESTE.cnpj, itens: [{ codigo: sku, quantidade: 2, valorUnitario: 60 }] });
  await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
  const secao = page.getByRole('region', { name: 'Fiscal' });
  await secao.getByLabel('Arquivo XML da NF de venda').setInputFiles({ name: 'venda.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await secao.getByRole('button', { name: 'Anexar XML' }).click();
  await expect(secao.getByText('NF de venda anexada.')).toBeVisible();
  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(page.getByText('Concluída', { exact: true }).first()).toBeVisible();

  // Cancelamento: a devolução volta para Aguardando NF e uma NF nova sai (outro ref).
  await secao.getByText('Cancelar esta NF').click();
  await secao.getByLabel('Justificativa (15 a 255 caracteres)').fill('Teste de integração entre as fases');
  await secao.getByRole('button', { name: 'Cancelar NF' }).click();
  await expect(secao.getByText('NF cancelada. A devolução voltou para Aguardando NF.')).toBeVisible();
  await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
  await expect(secao.getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
  await expect(secao.getByText(/cancelada em .*: Teste de integração entre as fases/)).toBeVisible();
  await semRolagemLateral(page);
});

test('NF de venda do Mercado Livre (conector falso da Fase 3) e rejeição → correção → reenvio', async ({ page }) => {
  test.skip(!emModoFalso(), 'O e2e do Mercado Livre roda só com ML_CONECTOR=falso.');
  test.setTimeout(240_000);
  // Conta ATIVA do vendedor falso (Fase 3): sem ela o registro devolve null (contrato §5.3).
  await garantirContaFalsa();
  // A varredura do ML falso não lista reclamações; o pedido sai de um cenário do falso (1: um item), único por execução.
  const ids = idsDaReclamacaoFalsa(idReclamacaoFalsa(1));
  expect(ids, 'o ML falso precisa reconhecer o id de reclamação do cenário 1').not.toBeNull();
  if (!ids) return;
  const pedido = ids.pedidos[0];
  const xmlVenda = await comBanco(async (db) => {
    const conector = await obterConector(db, 'MERCADO_LIVRE');
    return conector ? conector.obterXmlNotaVenda(pedido) : null;
  });
  expect(xmlVenda, 'o conector falso da Fase 3 precisa estar ativo no e2e e ter a NF de venda do pedido').not.toBeNull();
  if (!xmlVenda) return;
  const venda = interpretarXmlNotaVenda(xmlVenda);

  await prepararFiscal({ naturezas: { DENTRO_ESTADO: 'Devolucao de venda REJEITAR', FORA_ESTADO: 'Devolucao de venda REJEITAR' } });
  try {
    const dev = await comBanco(async (db) => {
      // A NF de venda do ML falso é emitida pelo CNPJ dele: a empresa do teste passa a ser essa.
      await db.update(configuracoes).set({ cnpj: venda.cnpjEmitente });
      const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
      return criarDevolucaoNoEstoqueTeste(db, gestor, {
        canal: 'MERCADO_LIVRE',
        pedido,
        unidades: [{ sku: venda.itens[0].codigo, destino: 'BOM' }],
      });
    });

    await entrarComo(page, USUARIOS_E2E.gestor);
    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    const secao = page.getByRole('region', { name: 'Fiscal' });
    await expect(secao.getByRole('button', { name: 'Buscar no Mercado Livre' })).toBeVisible();
    // "Emitir" busca a NF de venda no conector antes de montar (contrato §5.8).
    await secao.getByRole('button', { name: 'Emitir NF de devolução' }).click();
    await expect(secao.getByText('NF rejeitada', { exact: true })).toBeVisible(AUTORIZACAO);
    await expect(secao.getByText(/^Mercado Livre/)).toBeVisible();

    for (const operacao of ['DENTRO_ESTADO', 'FORA_ESTADO']) {
      await page.goto(`/configuracoes/fiscal/regras/DEVOLUCAO_VENDA/${operacao}`);
      await page.getByLabel('Natureza da operação').fill('Devolucao de venda');
      await page.getByRole('button', { name: 'Salvar regra' }).click();
      await expect(page.getByRole('status')).toHaveText('Regra fiscal salva.');
    }
    await page.goto(`/fluxo/devolucoes/${dev.codigo}`);
    await page.getByRole('region', { name: 'Fiscal' }).getByRole('button', { name: 'Corrigir e reenviar' }).click();
    await expect(page.getByRole('region', { name: 'Fiscal' }).getByText('NF autorizada', { exact: true })).toBeVisible(AUTORIZACAO);
    await semRolagemLateral(page);
  } finally {
    await prepararFiscal();
  }
});
