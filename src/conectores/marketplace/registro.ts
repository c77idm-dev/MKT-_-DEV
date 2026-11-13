import type { DbOuTx } from '@/db/client';
import type { Canal } from '@/modules/devolucoes/dominio';
import type { MarketplaceConnector } from './tipos';

const substitutos = new Map<Canal, MarketplaceConnector>();

/**
 * O conector do canal, ou null sem integração ou sem conta ATIVA (contrato §5.3).
 * Até a Fase 3 entrar, devolve sempre null. A Fase 3 troca o corpo desta função.
 */
export async function obterConector(db: DbOuTx, canal: Canal): Promise<MarketplaceConnector | null> {
  const substituto = substitutos.get(canal);
  if (substituto) return substituto;
  void db;
  return null;
}

/** Testes: com um conector, ele substitui o real; com null, VOLTA AO PADRÃO (contrato §5.3 e §10, E8). */
export function definirConectorParaTestes(canal: Canal, c: MarketplaceConnector | null): void {
  if (c) substitutos.set(canal, c);
  else substitutos.delete(canal);
}
