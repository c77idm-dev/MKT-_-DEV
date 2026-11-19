import type { DbOuTx } from '@/db/client';
import type { Canal } from '@/modules/devolucoes/dominio';
import { criarConectorML, type ContextoConectorML } from '@/modules/mercado-livre/fabrica-conector';
import type { MarketplaceConnector } from './tipos';

const substitutos = new Map<Canal, MarketplaceConnector>();

/** Contrato §5.3. No modo bitbrain, o contexto diz a conta (ou a devolução de onde ela sai); no modo api ele é ignorado. */
export async function obterConector(db: DbOuTx, canal: Canal, contexto: ContextoConectorML = {}): Promise<MarketplaceConnector | null> {
  const substituto = substitutos.get(canal);
  if (substituto) return substituto;
  if (canal === 'MERCADO_LIVRE') return criarConectorML(db, contexto);
  return null;
}

/** Testes: com um conector, ele substitui o real; com null, volta ao real (que devolve null sem conta ATIVA). */
export function definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void {
  if (c) substitutos.set(canal, c);
  else substitutos.delete(canal);
}
