import { expect, type APIRequestContext, type Locator } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { idReclamacaoFalsa, idsDaReclamacaoFalsa, vendedorFalso } from '../../src/conectores/marketplace/mercadolivre/falso';
import { contasMarketplace, contestacoesCanal, devolucoes } from '../../src/db/schema';
import type { MotivoItem } from '../../src/modules/devolucoes/dominio';
import { configML } from '../../src/modules/mercado-livre/config';
import { conectarConta } from '../../src/modules/mercado-livre/contas';
import { processarResultadoConferencia } from '../../src/modules/mercado-livre/resultado';
import { devolucaoMLConferidaTeste } from '../helpers/fabricas-ml';
import { comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** O e2e do ML só roda com o falso (ML_CONECTOR=falso no .env): nunca fala com o ML real. */
export function emModoFalso(): boolean {
  return configML().modo === 'falso';
}

export async function semContaML(): Promise<void> {
  await comBanco(async (db) => {
    await db.delete(contasMarketplace).where(eq(contasMarketplace.canal, 'MERCADO_LIVRE'));
  });
}

/** Conta do vendedor falso, ATIVA, com tokens falsos (a mesma chave do .env que o servidor e o worker usam). */
export async function garantirContaFalsa(): Promise<void> {
  await comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    await conectarConta(
      db,
      {
        accessToken: 'APP_USR-FALSO-E2E',
        refreshToken: 'TG-FALSO-E2E',
        expiraEm: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        userId: Number(vendedorFalso()),
        escopo: 'offline_access read write',
      },
      gestor,
      configML(),
      new Date(),
    );
  });
}

/** Aviso do ML como a documentação mostra (tópico post_purchase), enviado ao endpoint público. */
export async function avisarML(request: APIRequestContext, reclamacaoId: string): Promise<void> {
  const resposta = await request.post('/api/ml/notificacoes', {
    data: {
      _id: `e2e-${reclamacaoId}`,
      resource: `/post-purchase/v1/claims/${reclamacaoId}`,
      user_id: Number(vendedorFalso()),
      topic: 'post_purchase',
      actions: ['claims'],
      application_id: configML().clientId || '999',
      attempts: 1,
    },
  });
  expect(resposta.status()).toBe(200);
}

/** Espera o worker sincronizar a reclamação (aviso → fila → worker → banco) e devolve o código DEV. */
export async function esperarDevolucaoDaReclamacao(reclamacaoId: string): Promise<string> {
  let codigo = '';
  await expect
    .poll(
      async () => {
        codigo = await comBanco(async (db) => {
          const [d] = await db.select({ codigo: devolucoes.codigo }).from(devolucoes).where(eq(devolucoes.reclamacaoId, reclamacaoId));
          return d?.codigo ?? '';
        });
        return codigo;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .not.toBe('');
  return codigo;
}

/** Devolução do ML falso conferida (por fábrica, contrato §5.6) com 1 item PROBLEMA, e a contestação AGUARDANDO_GESTOR. */
export async function contestacaoPronta(p: { cenario: number; motivo: MotivoItem }): Promise<{ id: string; codigo: string }> {
  const ids = idsDaReclamacaoFalsa(idReclamacaoFalsa(p.cenario));
  if (!ids) throw new Error(`cenário falso inválido: ${p.cenario}`);
  return comBanco(async (db) => {
    const d = await devolucaoMLConferidaTeste(db, {
      itens: [{ sku: 'MLF-FONE-01', destino: 'PROBLEMA', motivo: p.motivo, observacao: 'Marcas de uso na caixa e no produto.' }],
      externa: {
        reclamacaoId: ids.reclamacaoId,
        devolucaoExternaId: ids.devolucaoId,
        pedidos: ids.pedidos,
        rastreio: ids.rastreio,
        prazoConferencia: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    });
    await processarResultadoConferencia(db, d.id, new Date());
    const [c] = await db.select({ id: contestacoesCanal.id }).from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, d.id));
    return { id: c.id, codigo: d.codigo };
  });
}

/** Mobile-first: botões, links, campos e rótulos de caixas de marcar dentro de `raiz` têm pelo menos 44 px de altura. */
export async function alvosDeToque44(raiz: Locator): Promise<void> {
  const pequenos = await raiz.evaluate((el) =>
    [
      ...el.querySelectorAll<HTMLElement>(
        'a, button, select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), label:has(input[type=checkbox]), label:has(input[type=radio])',
      ),
    ]
      .filter((alvo) => {
        const r = alvo.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((alvo) => `${alvo.tagName.toLowerCase()} "${(alvo.textContent ?? '').trim().slice(0, 40)}"`),
  );
  expect(pequenos, 'alvos de toque com menos de 44 px').toEqual([]);
}
