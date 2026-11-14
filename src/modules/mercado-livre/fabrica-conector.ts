import { and, eq } from 'drizzle-orm';
import { criarClienteML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { fetchFalsoML } from '@/conectores/marketplace/mercadolivre/falso';
import type { ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import { contasMarketplace } from '@/db/schema';
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
