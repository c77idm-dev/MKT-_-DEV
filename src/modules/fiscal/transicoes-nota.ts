import { ROTULO_SITUACAO_NOTA, type SituacaoNotaFiscal } from './dominio';
import { ErroFiscal } from './erros';

export type PedidoTransicaoNota = { de: SituacaoNotaFiscal | null; para: SituacaoNotaFiscal };

/** Spec §5.5 e contrato §4.6. Quem pode pedir cada uma é checado no serviço (emitir, reenviar, cancelar). */
export const REGRAS_TRANSICAO_NOTA: readonly PedidoTransicaoNota[] = [
  { de: null, para: 'PROCESSANDO' },
  { de: 'PROCESSANDO', para: 'AUTORIZADA' },
  { de: 'PROCESSANDO', para: 'REJEITADA' },
  { de: 'REJEITADA', para: 'PROCESSANDO' },
  { de: 'AUTORIZADA', para: 'CANCELADA' },
];

export function podeTransitarNota(p: PedidoTransicaoNota): boolean {
  return REGRAS_TRANSICAO_NOTA.some((r) => r.de === p.de && r.para === p.para);
}

export function exigirTransicaoNota(p: PedidoTransicaoNota): void {
  if (podeTransitarNota(p)) return;
  const de = p.de ? ROTULO_SITUACAO_NOTA[p.de] : '(nova)';
  throw new ErroFiscal(`Mudança não permitida na NF: ${de} → ${ROTULO_SITUACAO_NOTA[p.para]}.`);
}
