/**
 * Vocabulário fiscal (spec §5.1 NotaFiscal e RegraFiscal, §6.4, §8; contrato §4.3).
 * Sem imports com "@/" em tempo de execução: o schema importa este arquivo e o drizzle-kit não resolve o alias.
 * Também é importado por componentes de cliente: nada de banco aqui.
 */
import type { Destinatario } from '../../conectores/nfe/tipos';
import { ROTULO_DESTINO, type DestinoItem } from '../devolucoes/dominio';

/** Rótulos da Parte A (contrato §4.5 e §10, E2): reexportados, nunca redefinidos. */
export { ROTULO_AMBIENTE, ROTULO_REGIME } from '../configuracoes/dominio';

export const TIPOS_NOTA = ['DEVOLUCAO_VENDA', 'REMESSA_CONSERTO', 'REMESSA_TROCA_GARANTIA'] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];
export const ROTULO_TIPO_NOTA: Record<TipoNota, string> = {
  DEVOLUCAO_VENDA: 'Devolução de venda',
  REMESSA_CONSERTO: 'Remessa para conserto',
  REMESSA_TROCA_GARANTIA: 'Remessa para troca ou garantia',
};
export function ehTipoNota(texto: string): texto is TipoNota {
  return (TIPOS_NOTA as readonly string[]).includes(texto);
}

/** Situação da nota (spec §5.5). O tipo do emissor (SituacaoNota) é outro: a resposta da SEFAZ. */
export const SITUACOES_NOTA = ['PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA'] as const;
export type SituacaoNotaFiscal = (typeof SITUACOES_NOTA)[number];
export const ROTULO_SITUACAO_NOTA: Record<SituacaoNotaFiscal, string> = {
  PROCESSANDO: 'Em processamento',
  AUTORIZADA: 'Autorizada',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
};
/** Texto dos selos (cartões e Seção Fiscal). */
export const SELO_SITUACAO_NOTA: Record<SituacaoNotaFiscal, string> = {
  PROCESSANDO: 'NF em processamento',
  AUTORIZADA: 'NF autorizada',
  REJEITADA: 'NF rejeitada',
  CANCELADA: 'NF cancelada',
};

export const OPERACOES_FISCAIS = ['DENTRO_ESTADO', 'FORA_ESTADO'] as const;
export type OperacaoFiscal = (typeof OPERACOES_FISCAIS)[number];
export const ROTULO_OPERACAO: Record<OperacaoFiscal, string> = {
  DENTRO_ESTADO: 'dentro do estado',
  FORA_ESTADO: 'fora do estado',
};
export function ehOperacao(texto: string): texto is OperacaoFiscal {
  return (OPERACOES_FISCAIS as readonly string[]).includes(texto);
}

export const ORIGENS_NOTA_VENDA = ['MERCADO_LIVRE', 'ANEXO'] as const;
export type OrigemNotaVenda = (typeof ORIGENS_NOTA_VENDA)[number];
export const ROTULO_ORIGEM_NOTA_VENDA: Record<OrigemNotaVenda, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  ANEXO: 'XML anexado',
};

/** Valores aceitos (pesquisa focus-nfe.md §2.1). No Simples o ICMS usa CSOSN; no Presumido e no Real, CST (spec §8.2). */
export const CSOSN = ['101', '102', '103', '201', '202', '203', '300', '400', '500', '900'] as const;
export const CST_ICMS = ['00', '02', '10', '15', '20', '30', '40', '41', '50', '51', '53', '60', '61', '70', '90'] as const;
export const CST_PIS_COFINS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '49', '50', '51', '52', '53', '54', '55', '56',
  '60', '61', '62', '63', '64', '65', '66', '67', '70', '71', '72', '73', '74', '75', '98', '99',
] as const;

/** Apelido do destino da Parte A (`DestinoItem`: BOM ou PROBLEMA); os rótulos são os de `ROTULO_DESTINO`. */
export type DestinoEstoque = DestinoItem;
/** Abas da etapa 4 (spec §6.4). Caminhos, e não ?aba=, porque a Busca Avançada (GET) apagaria o parâmetro. */
export const ABAS_ESTOQUE: readonly { destino: DestinoEstoque; rotulo: string; href: string }[] = [
  { destino: 'BOM', rotulo: ROTULO_DESTINO.BOM, href: '/fluxo/etapa/4' },
  { destino: 'PROBLEMA', rotulo: ROTULO_DESTINO.PROBLEMA, href: '/fluxo/etapa/4/problema' },
];
export function rotulosDoEstoque(): string[] {
  return ABAS_ESTOQUE.map((a) => a.rotulo);
}

/** Tributos de uma unidade, tirados da NF de venda (valor do item ÷ quantidade). Alíquotas ficam como estão. */
export type TributosUnitarios = {
  icmsBase?: number;
  icmsAliquota?: number;
  icmsValor?: number;
  pisBase?: number;
  pisAliquota?: number;
  pisValor?: number;
  cofinsBase?: number;
  cofinsAliquota?: number;
  cofinsValor?: number;
};

/** Um item da NF de venda, como fica no jsonb `notas_venda.itens` (contrato §4.3). */
export type ItemNotaVenda = {
  /** nItem do XML (1, 2, ...). */
  numero: number;
  /** cProd: o código do produto (= SKU, D14). */
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string;
  /** CFOP da venda, só para consulta. */
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  origem: number;
  tributosPorUnidade: TributosUnitarios;
  /** D14: unidades da devolução (itens_devolucao.id) que o Fiscal ligou a este item. */
  itensDevolucaoIds: string[];
};

/** O destinatário guardado em `notas_venda.destinatario`: só o necessário à NF (LGPD). */
export type DestinatarioNotaVenda = Destinatario;

/** Prazo legal de cancelamento (Focus NFe: 24 h depois da autorização; spec §8.6). */
export const PRAZO_CANCELAMENTO_HORAS = 24;
export const JUSTIFICATIVA_MINIMA = 15;
export const JUSTIFICATIVA_MAXIMA = 255;

export function prazoDeCancelamento(autorizadaEm: Date): Date {
  return new Date(autorizadaEm.getTime() + PRAZO_CANCELAMENTO_HORAS * 60 * 60 * 1000);
}

export function dentroDoPrazoDeCancelamento(autorizadaEm: Date, agora: Date): boolean {
  return agora.getTime() < prazoDeCancelamento(autorizadaEm).getTime();
}

/** O `ref` da Focus: o id da nota sem hífens (só letras e números; contrato §4.3 e D12). */
export function referenciaDaNota(notaFiscalId: string): string {
  return notaFiscalId.replace(/-/g, '');
}
