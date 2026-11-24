/**
 * Ficha da venda (extra, emenda E27), com o ML falso: a seção "Venda (extra)" do detalhe da devolução do ML mostra o
 * básico da venda (pedido, data, situação, itens com foto, total, motivo e o link para a venda no ML). Roda no
 * computador e no celular (390×844).
 */
import { expect, test } from '@playwright/test';
import { idReclamacaoFalsa, idsDaReclamacaoFalsa } from '../../src/conectores/marketplace/mercadolivre/falso';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { alvosDeToque44, avisarML, emModoFalso, esperarDevolucaoDaReclamacao, garantirContaFalsa } from './apoio-ml';
import { FOTO_FONE_FALSO, fotoCarregada, responderFotosML, TITULO_FONE_FALSO } from './apoio-produtos-ml';
import { USUARIOS_E2E } from './dados';

test.skip(!emModoFalso(), 'O e2e do Mercado Livre roda só com ML_CONECTOR=falso.');
// O service worker do PWA não pode ficar entre a página e o page.route das fotos.
test.use({ serviceWorkers: 'block' });

test('a devolução do ML mostra a ficha da venda: situação em pt-BR, itens com foto, total, motivo e o link da venda', async ({ page, request }) => {
  await garantirContaFalsa();
  const reclamacaoId = idReclamacaoFalsa(1);
  const pedido = idsDaReclamacaoFalsa(reclamacaoId)!.pedidos[0];
  await avisarML(request, reclamacaoId);
  const codigo = await esperarDevolucaoDaReclamacao(reclamacaoId);

  await responderFotosML(page);
  // O Operador também vê a ficha (e o valor): ela vale para todos que veem a devolução.
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const secao = page.getByRole('region', { name: 'Venda (extra)' });
  await expect(secao).toContainText(pedido);
  await expect(secao).toContainText('Paga · Entregue');
  await expect(secao).toContainText('28/10/2026 09:00');
  const itens = secao.getByRole('list', { name: 'Itens vendidos' });
  await expect(itens.getByRole('listitem')).toHaveCount(1);
  await expect(itens).toContainText(TITULO_FONE_FALSO);
  await expect(itens).toContainText('SKU MLF-FONE-01');
  await expect(itens).toContainText('1 × R$ 129,90');
  const foto = itens.getByRole('img', { name: TITULO_FONE_FALSO });
  await expect(foto).toHaveAttribute('src', FOTO_FONE_FALSO);
  await fotoCarregada(foto);
  await expect(secao.getByText('Total')).toBeVisible();
  await expect(secao).toContainText('Comprador se arrependeu');
  await expect(secao).toContainText('Aberta');
  const link = secao.getByRole('link', { name: /Abrir a venda no ML/ });
  await expect(link).toHaveAttribute('href', `https://www.mercadolivre.com.br/vendas/${pedido}/detalhe`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await alvosDeToque44(secao);
  await semRolagemLateral(page);
});

test('sem os dados da venda: o aviso; devolução de outro canal: sem a seção', async ({ page }) => {
  // Um pedido por execução: só uma devolução em andamento por pedido e canal (cada projeto roda o teste uma vez).
  const pedido = `2000${Date.now()}`;
  const { semVenda, shopee } = await comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    return {
      semVenda: await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido }),
      shopee: await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE' }),
    };
  });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${semVenda.codigo}`);
  const secao = page.getByRole('region', { name: 'Venda (extra)' });
  await expect(secao).toContainText('Os dados da venda ainda não chegaram do ML.');
  await expect(secao).toContainText(pedido);
  await expect(secao.getByRole('link', { name: /Abrir a venda no ML/ })).toHaveAttribute('href', `https://www.mercadolivre.com.br/vendas/${pedido}/detalhe`);
  await alvosDeToque44(secao);
  await semRolagemLateral(page);

  await page.goto(`/fluxo/devolucoes/${shopee.codigo}`);
  await expect(page.getByRole('region', { name: /^Itens/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Venda (extra)' })).toHaveCount(0);
});
