import type { DevolucaoExterna, MarketplaceConnector } from '../tipos';

/** O que o sistema sabe de uma reclamação do ML. `devolucao` é null quando a reclamação não tem devolução. */
export type DadosDevolucaoML = {
  reclamacaoId: string;
  statusReclamacao: string | null;
  /** `reason_id` da reclamação (ex.: "PDD9949"); o texto vem de `obterMotivoReclamacao` (melhoria 1). */
  motivoId: string | null;
  subtipo: string | null;
  statusDevolucao: string | null;
  atualizadaEm: Date | null;
  devolucao: DevolucaoExterna | null;
};

export type ReclamacaoAtualizada = { reclamacaoId: string; atualizadaEm: Date | null };

/** O MarketplaceConnector (contrato §5.3) mais o que só o ML tem: o estado da reclamação e a lista para a varredura. */
export interface ConectorMercadoLivre extends MarketplaceConnector {
  readonly sellerId: string;
  obterReclamacao(reclamacaoId: string): Promise<DadosDevolucaoML>;
  reclamacoesAtualizadasDesde(desde: Date): AsyncIterable<ReclamacaoAtualizada>;
  /** Texto do motivo da reclamação. Erro do ML ou da rede lança (quem chama decide); formato desconhecido → null. */
  obterMotivoReclamacao(motivoId: string): Promise<string | null>;
}

export function ehConectorML(c: MarketplaceConnector | null): c is ConectorMercadoLivre {
  return c !== null && c.canal === 'MERCADO_LIVRE' && typeof (c as Partial<ConectorMercadoLivre>).obterReclamacao === 'function';
}
