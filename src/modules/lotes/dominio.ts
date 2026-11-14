import type { TomSelo } from '../devolucoes/selos';
import type { TipoNota } from '../fiscal/dominio';

export const TIPOS_LOTE = ['CONSERTO', 'TROCA', 'GARANTIA'] as const;
export type TipoLote = (typeof TIPOS_LOTE)[number];
export const ROTULO_TIPO_LOTE: Record<TipoLote, string> = { CONSERTO: 'Conserto', TROCA: 'Troca', GARANTIA: 'Garantia' };
export function ehTipoLote(texto: string): texto is TipoLote {
  return (TIPOS_LOTE as readonly string[]).includes(texto);
}

export const STATUS_LOTE = ['ABERTO', 'FECHADO', 'NF_EMITIDA', 'ENVIADO', 'FINALIZADO'] as const;
export type StatusLote = (typeof STATUS_LOTE)[number];
export const ROTULO_STATUS_LOTE: Record<StatusLote, string> = {
  ABERTO: 'Aberto',
  FECHADO: 'Fechado',
  NF_EMITIDA: 'NF emitida',
  ENVIADO: 'Enviado',
  FINALIZADO: 'Finalizado',
};
export const TOM_STATUS_LOTE: Record<StatusLote, TomSelo> = {
  ABERTO: 'destaque',
  FECHADO: 'atencao',
  NF_EMITIDA: 'destaque',
  ENVIADO: 'neutro',
  FINALIZADO: 'bom',
};
export function ehStatusLote(texto: string): texto is StatusLote {
  return (STATUS_LOTE as readonly string[]).includes(texto);
}

export const RESULTADOS_FORNECEDOR = ['TROCADO', 'CONSERTADO', 'CREDITO', 'DESCARTADO', 'DEVOLVIDO_SEM_SOLUCAO'] as const;
export type ResultadoFornecedor = (typeof RESULTADOS_FORNECEDOR)[number];
export const ROTULO_RESULTADO: Record<ResultadoFornecedor, string> = {
  TROCADO: 'Trocado',
  CONSERTADO: 'Consertado',
  CREDITO: 'Crédito',
  DESCARTADO: 'Descartado',
  DEVOLVIDO_SEM_SOLUCAO: 'Devolvido sem solução',
};
export function ehResultadoFornecedor(texto: string): texto is ResultadoFornecedor {
  return (RESULTADOS_FORNECEDOR as readonly string[]).includes(texto);
}

/** Status do item que exigem `lote_id` (CHECK itens_lote_status, decisão 20). */
export const STATUS_ITEM_NO_LOTE = ['EM_LOTE', 'ENVIADO', 'RESOLVIDO'] as const;
export const RASTREIO_ENVIO_MAXIMO = 60;

/** LOT-000045 (6 dígitos ou mais). */
export function ehCodigoLote(texto: string): boolean {
  return /^LOT-\d{6,}$/.test(texto);
}

/** Decisão 7: conserto tem NF própria; troca e garantia compartilham a de troca/garantia. */
export function tipoNotaDoLote(tipo: TipoLote): Extract<TipoNota, 'REMESSA_CONSERTO' | 'REMESSA_TROCA_GARANTIA'> {
  return tipo === 'CONSERTO' ? 'REMESSA_CONSERTO' : 'REMESSA_TROCA_GARANTIA';
}
