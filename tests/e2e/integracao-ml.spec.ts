/**
 * Contrato §7.3 e §10 (E11), pela tela e com o ML falso: aviso do ML → devolução criada pelo worker → recepção
 * (Fase 1) → conferência pela tela (Fase 2, `conferirDevolucao`) → todos BOM: "OK" ao ML; com PROBLEMA:
 * contestação na tela "Contestações ML" → "Enviar ao ML" → Enviada. O teste por serviço é o
 * `src/modules/mercado-livre/integracao-conferencia.int.test.ts`.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { idReclamacaoFalsa } from '../../src/conectores/marketplace/mercadolivre/falso';
import { devolucoes, evidencias, itensDevolucao } from '../../src/db/schema';
import { receberPorRastreio } from '../../src/modules/devolucoes/recebimento';
import { comBanco, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { conferirDevolucao, type UnidadeE2e } from './apoio-conferencia';
import { avisarML, emModoFalso, esperarDevolucaoDaReclamacao, garantirContaFalsa } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test.skip(!emModoFalso(), 'O e2e do Mercado Livre roda só com ML_CONECTOR=falso.');
// Jornada longa: conferência inteira pela tela (fotos, vídeo) e duas idas ao worker (sincronizar e enviar ao ML).
test.describe.configure({ timeout: 120_000 });

/** Devolução do ML falso (cenário 1) criada pelo aviso e já recebida pelo Operador. Devolve o código e quantas unidades tem. */
async function devolucaoDoMLRecebida(request: APIRequestContext): Promise<{ codigo: string; unidades: number }> {
  await garantirContaFalsa();
  const reclamacaoId = idReclamacaoFalsa(1);
  await avisarML(request, reclamacaoId);
  const codigo = await esperarDevolucaoDaReclamacao(reclamacaoId);
  return comBanco(async (db) => {
    const [d] = await db.select({ id: devolucoes.id, rastreio: devolucoes.rastreio }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    expect(await receberPorRastreio(db, d.rastreio ?? '', operador)).toMatchObject({ tipo: 'recebidas' });
    const itens = await db.select({ id: itensDevolucao.id }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, d.id));
    return { codigo, unidades: itens.length };
  });
}

/**
 * O worker da Fase 2 ainda pode estar processando as fotos logo depois da conclusão. O envio ao ML espera por elas
 * (contrato §5.4: nova tentativa em 30 s ou mais), então o Gestor envia depois que elas ficam prontas, como na vida real.
 */
async function esperarFotosProntas(codigo: string): Promise<void> {
  await expect
    .poll(
      () =>
        comBanco(async (db) => {
          const [d] = await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.codigo, codigo));
          const pendentes = await db
            .select({ id: evidencias.id })
            .from(evidencias)
            .where(and(eq(evidencias.devolucaoId, d.id), inArray(evidencias.situacaoProcessamento, ['RECEBIDA', 'PROCESSANDO'])));
          return pendentes.length;
        }),
      { timeout: 60_000, intervals: [1000, 2000] },
    )
    .toBe(0);
}

/** Recarrega a página até `texto` aparecer (o worker do e2e processa a fila em segundo plano). */
async function esperarNaTela(page: Page, texto: string | RegExp): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText(texto).count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBeGreaterThan(0);
}

test('devolução do ML conferida pela tela com todas as unidades em Estoque Bom: o "OK" chega ao ML', async ({ page, request }) => {
  const { codigo, unidades } = await devolucaoDoMLRecebida(request);
  await entrarComo(page, USUARIOS_E2E.operador);
  await conferirDevolucao(page, codigo, Array.from({ length: unidades }, (): UnidadeE2e => 'BOM'));

  await esperarNaTela(page, /"OK" enviado ao ML em/);
  await expect(page.locator('section[aria-labelledby="titulo-ml"]').getByText(/"OK" enviado ao ML em/)).toBeVisible();
  await semRolagemLateral(page);
});

test('devolução do ML conferida pela tela com Estoque Problema: contestação em "Contestações ML" e envio ao ML', async ({ page, request }) => {
  const { codigo, unidades } = await devolucaoDoMLRecebida(request);
  await entrarComo(page, USUARIOS_E2E.operador);
  await conferirDevolucao(
    page,
    codigo,
    Array.from({ length: unidades }, (): UnidadeE2e => ({ problema: 'AVARIADO' })),
  );

  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/contestacoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Contestações ML' })).toBeVisible();
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect
    .poll(
      async () => {
        await page.reload();
        return cartao.count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await expect(cartao).toContainText('SRF2');
  await semRolagemLateral(page);

  await esperarFotosProntas(codigo);
  await cartao.click();
  await expect(page.getByRole('heading', { level: 1, name: `Contestação ${codigo}` })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar ao ML' }).click();
  await page.getByRole('button', { name: 'Toque de novo para enviar ao ML' }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('heading', { name: 'Enviada ao ML' }).count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await semRolagemLateral(page);
});
