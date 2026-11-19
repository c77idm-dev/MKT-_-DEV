import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { RECLAMACOES_FALSAS_POR_EMPRESA } from '../../src/conectores/marketplace/bitbrain/falso';
import { devolucoes } from '../../src/db/schema';
import { comBanco, entrarComo, semRolagemLateral } from './apoio';
import { marcarContaFalsa } from './apoio-bitbrain';
import { alvosDeToque44 } from './apoio-ml';
import { USUARIOS_E2E } from './dados';

test('a varredura pela conta cria a devolução com a conta e os selos; o detalhe mostra a conta e os extras', async ({ page }) => {
  test.setTimeout(130_000); // o poll abaixo espera até 100 s (as tarefas por reclamação são cortadas por minuto)
  const [reclamacaoId] = RECLAMACOES_FALSAS_POR_EMPRESA['loja-falsa-1'];
  await marcarContaFalsa('loja-falsa-1');
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/mercado-livre');
  // As tarefas por reclamação são cortadas por minuto (chaveTarefaReclamacao): se uma varredura de outro teste, no mesmo minuto,
  // pegou a conta antes de ela ser marcada, esta só funciona no minuto seguinte. Por isso pede de novo até a devolução aparecer.
  let codigo = '';
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: 'Sincronizar agora' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Sincronização pedida.' })).toBeVisible();
        await page.waitForTimeout(3000);
        codigo = await comBanco(async (db) => {
          const [d] = await db.select({ codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.reclamacaoId, reclamacaoId));
          return d?.codigo ?? '';
        });
        return codigo;
      },
      { timeout: 100_000, intervals: [1000] },
    )
    .not.toBe('');

  await page.goto(`/fluxo/busca?reclamacao=${reclamacaoId}`);
  const cartao = page.getByRole('link', { name: new RegExp(codigo) });
  await expect(cartao).toContainText('Mercado Livre · Loja Falsa 1');
  await expect(cartao).toContainText('Urgente · até');
  await expect(cartao).toContainText('Afeta reputação');
  await expect(cartao).toContainText('Full');
  await semRolagemLateral(page);

  await page.goto(`/fluxo/devolucoes/${codigo}`);
  const secao = page.locator('section[aria-labelledby="titulo-ml"]');
  await expect(secao.getByText('Loja Falsa 1')).toBeVisible();
  await expect(secao.getByText('Afeta a reputação')).toBeVisible();
  await expect(secao.getByText('retido')).toBeVisible();
  await semRolagemLateral(page);
  await alvosDeToque44(secao);
});
