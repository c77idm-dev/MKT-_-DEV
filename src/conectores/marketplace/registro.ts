import type { DbOuTx } from '@/db/client';
import type { Canal } from '@/modules/devolucoes/dominio';
import { criarConectorMLDaConta } from '@/modules/mercado-livre/fabrica-conector';
import type { MarketplaceConnector } from './tipos';

const substitutos = new Map<Canal, MarketplaceConnector>();

/** Contrato §5.3: o conector do canal, ou null sem integração ou sem conta ATIVA. Hoje só o Mercado Livre tem integração. */
export async function obterConector(db: DbOuTx, canal: Canal): Promise<MarketplaceConnector | null> {
  const substituto = substitutos.get(canal);
  if (substituto) return substituto;
  if (canal === 'MERCADO_LIVRE') return criarConectorMLDaConta(db);
  return null;
}

/** Testes: com um conector, ele substitui o real; com null, volta ao real (que devolve null sem conta ATIVA). */
export function definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void {
  if (c) substitutos.set(canal, c);
  else substitutos.delete(canal);
}
