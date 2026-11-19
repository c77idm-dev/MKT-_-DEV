import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { RECLAMACOES_FALSAS_POR_EMPRESA } from '../../src/conectores/marketplace/bitbrain/falso';
import { contasBitbrain, devolucoes } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { marcarContaFalsa, semTarefasDeReclamacao } from './apoio-bitbrain';
import { alvosDeToque44 } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

const NOME_LONGO = 'IDM COMERCIO DE PRODUTOS ELETRONICOS E ACESSORIOS PARA CELULARES E INFORMATICA DO BRASIL LTDA';

test('a varredura pela conta cria a devolução com a conta e os selos; o detalhe mostra a conta e os extras', async ({ page }) => {
  const [reclamacaoId] = RECLAMACOES_FALSAS_POR_EMPRESA['loja-falsa-1'];
  const codigoDaReclamacao = () =>
    comBanco(async (db) => {
      const [d] = await db.select({ codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.reclamacaoId, reclamacaoId));
      return d?.codigo ?? '';
    });
  await marcarContaFalsa('loja-falsa-1');
  // Uma tarefa por reclamação de outro teste pode ter rodado depois de as contas mudarem (termina sem devolução) e, com a
  // deduplicação por minuto, bloquearia a nova. Sem elas, um único toque basta.
  await semTarefasDeReclamacao();
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronização pedida.' })).toBeVisible();
  await expect.poll(codigoDaReclamacao, { timeout: 30_000, intervals: [500] }).not.toBe('');
  const codigo = await codigoDaReclamacao();

  await page.goto(`/fluxo/busca?reclamacao=${reclamacaoId}`);
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText('Mercado Livre · Loja Falsa 1');
  await expect(cartao).toContainText('Urgente · até');
  await expect(cartao).toContainText('Afeta reputação');
  await expect(cartao).toContainText('Full');
  await semRolagemLateral(page);

  // Conta com nome longo (o máximo do /empresas) não pode alargar o cartão nem criar rolagem lateral no celular.
  try {
    await comBanco((db) => db.update(contasBitbrain).set({ nome: NOME_LONGO }).where(eq(contasBitbrain.empresa, 'loja-falsa-1')));
    await page.reload();
    await expect(page.getByRole('link', { name: new RegExp(codigo) })).toContainText('Mercado Livre · ');
    await semRolagemLateral(page);
  } finally {
    // O bitbrain-respostas espera este nome.
    await comBanco((db) => db.update(contasBitbrain).set({ nome: 'Loja Falsa 1' }).where(eq(contasBitbrain.empresa, 'loja-falsa-1')));
  }

  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const secao = page.locator('section[aria-labelledby="titulo-ml"]');
  await expect(secao.getByText('Loja Falsa 1')).toBeVisible();
  await expect(secao.getByText('Afeta a reputação')).toBeVisible();
  await expect(secao.getByText('retido')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);
});
