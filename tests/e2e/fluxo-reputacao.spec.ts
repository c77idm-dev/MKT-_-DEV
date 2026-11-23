import { expect, test } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { devolucoes, reclamacoesMl } from '../../src/db/schema';
import type { StatusDevolucao } from '../../src/modules/devolucoes/dominio';
import type { AfetaReputacao } from '../../src/modules/mercado-livre/dominio';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { abrirBusca, codigoUnico, comBanco, ehCelular, entrarComo, semRolagemLateral, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

const CAIXA = 'Só as que afetam a reputação no ML (extra)';

/** Devolução do ML no status pedido, com uma reclamação sincronizada agora. */
async function devolucaoML(status: StatusDevolucao, afetaReputacao: AfetaReputacao): Promise<{ id: string; codigo: string }> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const d = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', rastreio: codigoUnico('REP') });
    await db.update(devolucoes).set({ status }).where(eq(devolucoes.id, d.id));
    await db.insert(reclamacoesMl).values({ claimId: codigoUnico('E2EREP'), devolucaoId: d.id, afetaReputacao, sincronizadaEm: new Date() });
    return { id: d.id, codigo: d.codigo };
  });
}

test('(extra) "Afetam a reputação · N" ao lado de Filtros: conta as não encerradas (inclusive No CD do marketplace), abre a Busca só com elas e some com N = 0', async ({
  page,
}, testInfo) => {
  // O banco do e2e é compartilhado: as reclamações que afetam a reputação de outros testes ficam de lado e voltam no fim.
  const deOutros = await comBanco(async (db) =>
    (
      await db
        .update(reclamacoesMl)
        .set({ afetaReputacao: 'NAO_AFETA' })
        .where(eq(reclamacoesMl.afetaReputacao, 'AFETA'))
        .returning({ claimId: reclamacoesMl.claimId })
    ).map((r) => r.claimId),
  );
  try {
    const pendente = await devolucaoML('PENDENTE_CHEGADA', 'AFETA');
    const aguardandoNf = await devolucaoML('AGUARDANDO_NF', 'AFETA');
    const noCd = await devolucaoML('NO_CD_MARKETPLACE', 'AFETA');
    const concluida = await devolucaoML('CONCLUIDA', 'AFETA');
    const naoAfeta = await devolucaoML('PENDENTE_CHEGADA', 'NAO_AFETA');

    await entrarComo(page, USUARIOS_E2E.operador);
    const atalho = page.getByRole('link', { name: 'Afetam a reputação · 3' });
    await expect(atalho).toBeVisible();
    expect((await atalho.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    if (ehCelular(testInfo)) {
      // Na mesma linha do botão Filtros.
      const filtros = (await page.getByRole('button', { name: /^Filtros/ }).boundingBox())!;
      const caixa = (await atalho.boundingBox())!;
      expect(Math.abs(caixa.y - filtros.y)).toBeLessThan(2);
      expect(caixa.x).toBeGreaterThan(filtros.x);
    }
    await semRolagemLateral(page);

    await atalho.click();
    await expect(page).toHaveURL(/\/fluxo\/busca\?reputacao=1$/);
    await expect(page.getByText('3 devoluções', { exact: true })).toBeVisible();
    for (const d of [pendente, aguardandoNf, noCd]) {
      await expect(page.getByRole('link', { name: new RegExp(d.codigo) })).toContainText('Afeta reputação');
    }
    for (const d of [concluida, naoAfeta]) await expect(page.getByRole('link', { name: new RegExp(d.codigo) })).toHaveCount(0);
    await semRolagemLateral(page);

    // A etiqueta tira o filtro com um toque, e a caixa do painel fica desmarcada.
    const etiqueta = page.getByRole('link', { name: 'Remover filtro: Afetam a reputação' });
    await expect(etiqueta).toHaveText(/Afetam a reputação/);
    await etiqueta.click();
    await expect(page).toHaveURL(/\/fluxo\/busca$/);
    await expect(etiqueta).toHaveCount(0);
    await expect(page.getByRole('link', { name: new RegExp(concluida.codigo) })).toBeVisible();
    await abrirBusca(page);
    const caixa = page.getByRole('checkbox', { name: CAIXA });
    await expect(caixa).not.toBeChecked();

    // A caixa do painel liga o filtro de novo.
    await caixa.check();
    await page.getByRole('button', { name: 'Buscar' }).click();
    // O formulário GET manda também os campos vazios.
    await expect(page).toHaveURL(/\/fluxo\/busca\?.*\breputacao=1\b/);
    await expect(page.getByRole('link', { name: 'Remover filtro: Afetam a reputação' })).toBeVisible();
    await expect(page.getByText('3 devoluções', { exact: true })).toBeVisible();

    // N = 0: o botão some.
    await comBanco((db) =>
      db
        .update(reclamacoesMl)
        .set({ afetaReputacao: 'NAO_AFETA' })
        .where(inArray(reclamacoesMl.devolucaoId, [pendente.id, aguardandoNf.id, noCd.id])),
    );
    await page.goto('/fluxo');
    await expect(page.getByRole('heading', { level: 1, name: 'Fluxo de devoluções' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'O que você quer fazer?' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Afetam a reputação/ })).toHaveCount(0);
    await semRolagemLateral(page);
  } finally {
    if (deOutros.length > 0) {
      await comBanco((db) => db.update(reclamacoesMl).set({ afetaReputacao: 'AFETA' }).where(inArray(reclamacoesMl.claimId, deOutros)));
    }
  }
});
