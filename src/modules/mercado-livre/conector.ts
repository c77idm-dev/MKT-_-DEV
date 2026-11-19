import { ehConectorML, type ConectorMercadoLivre } from '@/conectores/marketplace/mercadolivre/tipos';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';
import type { ContextoConectorML } from './fabrica-conector';

/** O conector do ML com os métodos só dele (obterReclamacao, varredura). Null sem conta ATIVA. */
export async function obterConectorML(db: DbOuTx, contexto: ContextoConectorML = {}): Promise<ConectorMercadoLivre | null> {
  const conector = await obterConector(db, 'MERCADO_LIVRE', contexto);
  return ehConectorML(conector) ? conector : null;
}
