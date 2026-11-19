import { and, desc, eq, isNotNull, type SQL } from 'drizzle-orm';
import { criarClienteViaBitbrain } from '@/conectores/marketplace/bitbrain/cliente';
import { fetchBitbrainFalso } from '@/conectores/marketplace/bitbrain/falso';
import { criarClienteML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { fetchFalsoML } from '@/conectores/marketplace/mercadolivre/falso';
import type { ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, contasMarketplace, reclamacoesMl } from '@/db/schema';
import { URL_BITBRAIN_FALSO } from '@/lib/env';
import { ehUuid } from '@/lib/uuid';
import { configML, type ConfigML } from './config';
import { tokenValido } from './contas';

/** ML_CONECTOR=falso troca só o fetch (D17: o lerEnv recusa o falso em produção). */
export function fetchDoML(config: ConfigML): typeof fetch {
  return config.modo === 'falso' ? fetchFalsoML : fetch;
}

/** O ConectorML da conta ATIVA, com o token renovado sob demanda (e uma vez no 401). Null sem conta ATIVA. */
export async function criarConectorMLDaConta(
  db: DbOuTx,
  o: { config?: ConfigML; fetchFn?: typeof fetch; agora?: () => Date } = {},
): Promise<ConectorMercadoLivre | null> {
  const config = o.config ?? configML();
  const fetchFn = o.fetchFn ?? fetchDoML(config);
  const [conta] = await db
    .select({ id: contasMarketplace.id, sellerId: contasMarketplace.sellerId })
    .from(contasMarketplace)
    .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), eq(contasMarketplace.situacao, 'ATIVA')))
    .limit(1);
  if (!conta) return null;
  const opcoes = { config, fetchFn, agora: o.agora };
  const cliente = criarClienteML({
    accessToken: () => tokenValido(db, conta.id, opcoes),
    renovarToken: (recusado) => tokenValido(db, conta.id, { ...opcoes, recusado }),
    fetchFn,
  });
  return new ConectorML({ sellerId: conta.sellerId, cliente });
}

/** D3: o Bitbrain falso só com a URL de testes E PERMITIR_FALSOS=1; fora disso, o fetch de verdade (a URL .invalid não resolve). */
export function fetchDoBitbrain(config: ConfigML): typeof fetch {
  return config.bitbrainUrl === URL_BITBRAIN_FALSO && config.permitirFalsos ? fetchBitbrainFalso : fetch;
}

/** D19: o contexto que escolhe a conta no modo bitbrain. No modo api ele é ignorado. */
export type ContextoConectorML = { conta?: string | null; devolucaoId?: string | null };

/** §4.4: o ConectorML da conta do Bitbrain (vendedor da conta, transporte pela rota). Null se a conta não existe. */
export async function obterConectorDaConta(
  db: DbOuTx,
  empresa: string,
  o: { config?: ConfigML; fetchFn?: typeof fetch } = {},
): Promise<ConectorMercadoLivre | null> {
  const config = o.config ?? configML();
  const [conta] = await db.select({ sellerId: contasBitbrain.sellerId }).from(contasBitbrain).where(eq(contasBitbrain.empresa, empresa));
  if (!conta) return null;
  const cliente = criarClienteViaBitbrain({ url: config.bitbrainUrl, token: config.bitbrainToken, empresa, fetchFn: o.fetchFn ?? fetchDoBitbrain(config) });
  return new ConectorML({ sellerId: conta.sellerId, cliente });
}

async function contaPor(db: DbOuTx, onde: SQL): Promise<string | null> {
  const [r] = await db
    .select({ conta: reclamacoesMl.conta })
    .from(reclamacoesMl)
    .where(and(onde, isNotNull(reclamacoesMl.conta)))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(1);
  return r?.conta ?? null;
}

export async function contaDaDevolucao(db: DbOuTx, devolucaoId: string): Promise<string | null> {
  return ehUuid(devolucaoId) ? contaPor(db, eq(reclamacoesMl.devolucaoId, devolucaoId)) : null;
}

export async function contaDaReclamacao(db: DbOuTx, claimId: string): Promise<string | null> {
  return contaPor(db, eq(reclamacoesMl.claimId, claimId));
}

/** obterConector do canal ML: modo api (ou falso) igual a hoje; modo bitbrain pela conta do contexto ou da devolução. */
export async function criarConectorML(
  db: DbOuTx,
  contexto: ContextoConectorML = {},
  o: { config?: ConfigML; fetchFn?: typeof fetch; agora?: () => Date } = {},
): Promise<ConectorMercadoLivre | null> {
  const config = o.config ?? configML();
  if (config.modo !== 'bitbrain') return criarConectorMLDaConta(db, { ...o, config });
  const conta = contexto.conta ?? (contexto.devolucaoId ? await contaDaDevolucao(db, contexto.devolucaoId) : null);
  return conta ? obterConectorDaConta(db, conta, { config, fetchFn: o.fetchFn }) : null;
}
