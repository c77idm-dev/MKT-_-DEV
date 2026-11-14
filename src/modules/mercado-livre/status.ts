import type { DevolucaoExterna } from '@/conectores/marketplace/tipos';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';

/** Spec §7.3. */
export const STATUS_ML_CANCELAMENTO: ReadonlySet<string> = new Set(['cancelled', 'pending_cancel', 'expired', 'pending_expiration', 'return_to_buyer']);
export const STATUS_ML_EXTRAVIO: ReadonlySet<string> = new Set(['not_delivered', 'failed', 'pending_failure']);
/** Antes da chegada física o status do ML ainda move a devolução; depois, só vira evento (spec §7.3). */
export const ANTES_DA_CHEGADA: readonly StatusDevolucao[] = ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'];

export type SituacaoML = Pick<DevolucaoExterna, 'statusCanal' | 'destinoEnvio' | 'reenvioDaTriagem'>;

/** O conector grava "<return.status>/<status do envio>" (decisão 2 do plano); a regra usa o da devolução. */
export function statusDaDevolucaoML(statusCanal: string): string {
  return statusCanal.split('/')[0];
}

export function encerradaNoML(d: SituacaoML): 'CANCELADA' | 'EXTRAVIADA' | null {
  const status = statusDaDevolucaoML(d.statusCanal);
  if (STATUS_ML_CANCELAMENTO.has(status)) return 'CANCELADA';
  if (STATUS_ML_EXTRAVIO.has(status)) return 'EXTRAVIADA';
  return null;
}

/**
 * Spec §7.3 aplicada a uma devolução que está em `atual`. Devolve o novo status, ou null quando nada muda. Só as
 * linhas da spec §5.2 que são do SISTEMA:
 * - de PENDENTE_CHEGADA para CANCELADA, EXTRAVIADA ou NO_CD_MARKETPLACE;
 * - de NO_CD_MARKETPLACE para PENDENTE_CHEGADA.
 * "Entregue" não muda o status (spec §5.2).
 */
export function proximoStatusML(atual: StatusDevolucao, d: SituacaoML): 'PENDENTE_CHEGADA' | 'CANCELADA' | 'EXTRAVIADA' | 'NO_CD_MARKETPLACE' | null {
  const encerrada = encerradaNoML(d);
  if (atual === 'PENDENTE_CHEGADA') {
    if (encerrada) return encerrada;
    if (d.destinoEnvio === 'CD_MARKETPLACE' && !d.reenvioDaTriagem) return 'NO_CD_MARKETPLACE';
    return null;
  }
  if (atual === 'NO_CD_MARKETPLACE' && d.reenvioDaTriagem && !encerrada) return 'PENDENTE_CHEGADA';
  return null;
}
