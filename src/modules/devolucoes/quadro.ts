import type { DbOuTx } from '@/db/client';
import { buscarDevolucoes, type ResumoDevolucao } from './busca';
import { statusDaEtapa } from './dominio';
import { ETAPAS } from './etapas';

export const CARTOES_POR_COLUNA = 5;

/** Nota da etapa 5 (mesmo texto da página /fluxo/etapa/5): os lotes por fornecedor chegam numa fase posterior. */
export const NOTA_ETAPA_LOTES = 'Os lotes por fornecedor aparecem aqui quando a conferência estiver pronta.';

export type ColunaQuadro = { numero: number; titulo: string; total: number; cartoes: ResumoDevolucao[]; href: string };

/** Uma coluna por etapa do PDF (spec §6.0), com o total e os primeiros cartões. A coluna 5 (lotes) fica zerada até a Fase 5. */
export async function montarQuadro(db: DbOuTx, agora: Date = new Date()): Promise<ColunaQuadro[]> {
  return Promise.all(
    ETAPAS.map(async (etapa) => {
      const href = `/fluxo/etapa/${etapa.numero}`;
      const status = statusDaEtapa(etapa.numero);
      if (status.length === 0) return { numero: etapa.numero, titulo: etapa.titulo, total: 0, cartoes: [], href };
      const { devolucoes, total } = await buscarDevolucoes(
        db,
        {},
        { status, ordem: etapa.numero === 2 ? 'chegada' : 'recentes', porPagina: CARTOES_POR_COLUNA, agora },
      );
      return { numero: etapa.numero, titulo: etapa.titulo, total, cartoes: devolucoes, href };
    }),
  );
}
