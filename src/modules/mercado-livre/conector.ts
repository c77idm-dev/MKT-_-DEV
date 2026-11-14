import { ehConectorML, type ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';

/** O conector do ML com os métodos só dele (obterReclamacao, varredura). Null sem conta ATIVA. */
export async function obterConectorML(db: DbOuTx): Promise<ConectorMercadoLivre | null> {
  const conector = await obterConector(db, 'MERCADO_LIVRE');
  return ehConectorML(conector) ? conector : null;
}
