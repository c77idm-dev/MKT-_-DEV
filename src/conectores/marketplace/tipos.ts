import type { Canal, TipoDevolucao } from '@/modules/devolucoes/dominio';

/**
 * Interface da spec §4.3 mais o método da §7.5 (contrato §5.3). Implementação do Mercado Livre: Fase 3.
 * O que só um canal tem (no ML: status e subtipo da reclamação, varredura) fica numa interface do canal que ESTENDE
 * esta, na pasta dele (ex.: `ConectorMercadoLivre extends MarketplaceConnector`, com um guarda de tipo). Este arquivo
 * não muda depois da Parte A (contrato §10, E9).
 */
export type DevolucaoExterna = {
  canal: Canal;
  devolucaoExternaId: string;
  reclamacaoId: string;
  tipo: TipoDevolucao;
  /** subtype low_cost: sem envio físico. */
  semEnvioFisico: boolean;
  pedidos: string[];
  /** Valor bruto (return.status e o envio). */
  statusCanal: string;
  destinoEnvio: 'VENDEDOR' | 'CD_MARKETPLACE' | null;
  reenvioDaTriagem: boolean;
  rastreio: string | null;
  transportadora: string | null;
  entregueEm: Date | null;
  prazoConferencia: Date | null;
  atualizadaEm: Date;
  itens: { pedido: string; sku: string; ean: string | null; quantidade: number }[];
};

export type MotivoCanal = 'SRF2' | 'SRF3' | 'SRF4' | 'SRF5' | 'SRF6';

export type ResultadoConferencia =
  | { tipo: 'OK' }
  | {
      tipo: 'PROBLEMA';
      reclamacaoId: string;
      motivo: MotivoCanal;
      mensagem: string;
      pedido?: string;
      anexos: { nome: string; conteudo: Buffer; tipoConteudo: 'image/jpeg' }[];
    };

export interface MarketplaceConnector {
  canal: Canal;
  listarAtualizadasDesde(desde: Date): AsyncIterable<DevolucaoExterna>;
  /** No ML, `idExterno` é o claim_id (o aviso traz a reclamação). */
  obter(idExterno: string): Promise<DevolucaoExterna>;
  /** No ML, `idExterno` é o return_id (= `devolucaoExternaId`), o que o return-review pede. */
  enviarResultadoConferencia(idExterno: string, r: ResultadoConferencia): Promise<void>;
  /** null = o canal não tem a nota. */
  obterXmlNotaVenda(pedidoExterno: string): Promise<string | null>;
}
