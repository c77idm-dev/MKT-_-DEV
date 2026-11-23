/**
 * Produtos do ML (extra, emenda E22), com o ML falso: a devolução sincronizada cadastra o produto pelo anúncio (título,
 * GTIN, foto e id do anúncio) e liga os itens; a foto aparece no cartão, na unidade da conferência e em Cadastros.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { idReclamacaoFalsa } from '../../src/conectores/marketplace/mercadolivre/falso';
import { devolucoes, itensDevolucao } from '../../src/db/schema';
import { iniciarConferencia } from '../../src/modules/conferencia/trava';
import { receberPorRastreio } from '../../src/modules/devolucoes/recebimento';
import { comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { esperarEnviada, fotoDeTeste } from './apoio-conferencia';
import { avisarML, emModoFalso, esperarDevolucaoDaReclamacao, garantirContaFalsa } from './apoio-ml';
import { FOTO_FONE_FALSO, fotoCarregada, produtoDoSku, recusarFotosML, responderFotosML, TITULO_FONE_FALSO } from './apoio-produtos-ml';
import { USUARIOS_E2E } from './dados';

test.skip(!emModoFalso(), 'O e2e do Mercado Livre roda só com ML_CONECTOR=falso.');
// O service worker do PWA não pode ficar entre a página e o page.route das fotos.
test.use({ serviceWorkers: 'block' });

/** Devolução do ML falso (cenário 1: MLF-FONE-01) criada pelo aviso. */
async function devolucaoDoML(request: APIRequestContext): Promise<{ codigo: string; reclamacaoId: string }> {
  await garantirContaFalsa();
  const reclamacaoId = idReclamacaoFalsa(1);
  await avisarML(request, reclamacaoId);
  return { codigo: await esperarDevolucaoDaReclamacao(reclamacaoId), reclamacaoId };
}

test('a devolução do ML cadastra o produto pelo anúncio; o cartão, Cadastros › Produtos e o produto mostram a foto', async ({ page, request }) => {
  const { codigo, reclamacaoId } = await devolucaoDoML(request);
  const produto = await produtoDoSku('MLF-FONE-01');
  expect(produto).toMatchObject({ descricao: TITULO_FONE_FALSO, ean: '7891234567895', fotoUrl: FOTO_FONE_FALSO, fornecedorId: null });
  expect(produto?.mlItemId).toMatch(/^MLB9/);
  const itens = await comBanco(async (db) => {
    const [d] = await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
    return db.select({ produto: itensDevolucao.produtoEsperadoId }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, d.id));
  });
  expect(itens).toEqual([{ produto: produto?.id }]);

  await responderFotosML(page);
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/busca?reclamacao=${reclamacaoId}`);
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText(TITULO_FONE_FALSO);
  const fotoCartao = cartao.getByRole('img', { name: TITULO_FONE_FALSO });
  await expect(fotoCartao).toHaveAttribute('src', FOTO_FONE_FALSO);
  await expect(fotoCartao).toHaveAttribute('referrerpolicy', 'no-referrer');
  await fotoCarregada(fotoCartao);
  expect((await fotoCartao.boundingBox())?.width).toBe(44);
  await semRolagemLateral(page);

  await page.goto(`/fluxo/devolucoes/${codigo}`);
  await fotoCarregada(page.getByRole('region', { name: /^Itens/ }).getByRole('img', { name: TITULO_FONE_FALSO }));
  await semRolagemLateral(page);

  await page.goto('/cadastros/produtos?busca=MLF-FONE-01');
  const linha = page.getByRole('link', { name: /^Editar MLF-FONE-01/ });
  await fotoCarregada(linha.getByRole('img', { name: TITULO_FONE_FALSO }));
  await expect(linha).toContainText('Sem fornecedor');
  await semRolagemLateral(page);
  await linha.click();
  const bloco = page.getByRole('region', { name: 'Foto do anúncio do ML (extra)' });
  await fotoCarregada(bloco.getByRole('img', { name: TITULO_FONE_FALSO }));
  await expect(bloco).toContainText(`Anúncio ${produto?.mlItemId}`);
  await semRolagemLateral(page);
});

test('foto que não carrega: o ícone neutro no lugar, nunca uma imagem quebrada', async ({ page, request }) => {
  const { codigo, reclamacaoId } = await devolucaoDoML(request);
  await recusarFotosML(page);
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/busca?reclamacao=${reclamacaoId}`);
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao.getByRole('img', { name: 'Sem foto do produto' })).toBeVisible();
  await expect(cartao.locator('img')).toHaveCount(0);
  await semRolagemLateral(page);
});

test('a unidade da conferência mostra a foto do anúncio (64 px) para comparar com o produto na mão', async ({ page, request }) => {
  const { codigo } = await devolucaoDoML(request);
  await comBanco(async (db) => {
    const [d] = await db.select({ id: devolucoes.id, rastreio: devolucoes.rastreio }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    expect(await receberPorRastreio(db, d.rastreio ?? '', operador)).toMatchObject({ tipo: 'recebidas' });
    await iniciarConferencia(db, d.id, operador);
  });
  await responderFotosML(page);
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${codigo}/conferencia`);
  // Espera a hidratação: sem isso o setInputFiles pode disparar antes de o onChange existir.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste('foto-1.jpg'));
  await page.getByLabel('Tirar Foto 2', { exact: true }).setInputFiles(await fotoDeTeste('foto-2.jpg'));
  await esperarEnviada(page, 'Foto 1');
  await esperarEnviada(page, 'Foto 2');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Unidade 1' })).toBeVisible();
  const foto = page.getByRole('img', { name: TITULO_FONE_FALSO });
  await fotoCarregada(foto);
  expect((await foto.boundingBox())?.width).toBe(64);
  await expect(page.getByText('EAN esperado: 7891234567895')).toBeVisible();
  await semRolagemLateral(page);
});
