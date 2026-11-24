import type { AfetaReputacao, CondicaoTriagem, SituacaoDinheiro } from '@/modules/mercado-livre/dominio';
import type { DevolucaoExterna, MarketplaceConnector } from '../tipos';

/** Os 5 extras (integração Bitbrain §4.5). Nulo = o ML não informou. */
export type ExtrasML = {
  acaoPendente: string | null;
  urgente: boolean | null;
  afetaReputacao: AfetaReputacao | null;
  ehFull: boolean | null;
  triagemCondicao: CondicaoTriagem | null;
  triagemEtapa: string | null;
  dinheiro: SituacaoDinheiro | null;
};

/**
 * Produtos do ML (extra): o que o anúncio de um item da devolução diz do produto. A sincronização cadastra o SKU que falta
 * e completa só os campos vazios do que já existe (modules/mercado-livre/produtos-anuncio.ts).
 */
export type ProdutoDoAnuncioML = {
  /** O mesmo SKU do item da devolução (ainda sem a normalização do cadastro). */
  sku: string;
  /** Id do anúncio (MLB...). */
  mlItemId: string;
  /** Título do anúncio. */
  descricao: string | null;
  /** GTIN válido (variação primeiro, depois o anúncio). */
  ean: string | null;
  /** Foto principal, só https. */
  fotoUrl: string | null;
};

/**
 * Ficha da venda (extra, emenda E27): um item do pedido do ML. Nulo = o ML não informou ou mandou fora do formato.
 * Só estes campos são gravados (vendas_ml.itens): nada do comprador.
 */
export type ItemVendaML = {
  /** Id do anúncio (MLB...). */
  anuncioId: string | null;
  /** Título do anúncio na venda. */
  titulo: string | null;
  /** seller_sku (ou seller_custom_field), como veio do ML. */
  sku: string | null;
  variacaoId: string | null;
  quantidade: number | null;
  /** Valor unitário em reais (unit_price). */
  valorUnitario: number | null;
};

/**
 * Ficha da venda (extra, emenda E27): o básico de um pedido do ML, tirado do GET /orders/{id} e do envio da venda que a
 * sincronização já lia (nenhuma chamada nova). Situações em código do ML (ex.: "paid", "delivered").
 */
export type VendaML = {
  pedidoId: string;
  vendidaEm: Date | null;
  situacao: string | null;
  situacaoEnvio: string | null;
  itens: ItemVendaML[];
};

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
  extras: ExtrasML;
  /** Um por item da devolução cujo anúncio foi lido (extra); vazio sem devolução. */
  produtos: ProdutoDoAnuncioML[];
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
