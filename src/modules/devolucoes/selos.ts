import { formatarDiaMes } from '@/lib/formatar';
import { SELO_SITUACAO_NOTA, type SituacaoNotaFiscal } from '@/modules/fiscal/dominio';
import type { Canal, StatusDevolucao } from './dominio';

export type TomSelo = 'erro' | 'atencao' | 'destaque' | 'bom' | 'neutro';
export type DadosSelo = { texto: string; tom: TomSelo };

type Entrada = {
  canal: Canal | null;
  status: StatusDevolucao;
  naoIdentificada: boolean;
  entregueSegundoCanalEm: Date | null;
  prazoConferenciaCanal: Date | null;
  /** A NF de devolução que não está cancelada (Fase 4). */
  situacaoNota?: SituacaoNotaFiscal | null;
};

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const ANTES_DA_CONFERENCIA: StatusDevolucao[] = ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA'];
const TOM_DA_NOTA: Partial<Record<SituacaoNotaFiscal, TomSelo>> = { PROCESSANDO: 'destaque', REJEITADA: 'erro', AUTORIZADA: 'bom' };

/** Selos do cartão (spec §6.0: prazo, entregue pelo ML etc.). Calculados aqui, fora do componente, porque dependem da hora. */
export function selosDaDevolucao(d: Entrada, agora: Date): DadosSelo[] {
  const selos: DadosSelo[] = [];
  if (d.naoIdentificada) selos.push({ texto: 'Não identificada', tom: 'erro' });
  if (d.entregueSegundoCanalEm && d.status === 'PENDENTE_CHEGADA') {
    selos.push({ texto: d.canal === 'MERCADO_LIVRE' ? 'Entregue (ML)' : 'Entregue pelo canal', tom: 'atencao' });
  }
  if (d.prazoConferenciaCanal && ANTES_DA_CONFERENCIA.includes(d.status)) {
    const vencendo = d.prazoConferenciaCanal.getTime() - agora.getTime() <= UM_DIA_MS;
    selos.push({ texto: `Prazo ${formatarDiaMes(d.prazoConferenciaCanal)}`, tom: vencendo ? 'erro' : 'neutro' });
  }
  const tomNota = d.situacaoNota ? TOM_DA_NOTA[d.situacaoNota] : undefined;
  if (d.situacaoNota && tomNota) selos.push({ texto: SELO_SITUACAO_NOTA[d.situacaoNota], tom: tomNota });
  return selos;
}

export const TOM_DO_STATUS: Record<StatusDevolucao, TomSelo> = {
  PENDENTE_CHEGADA: 'neutro',
  AGUARDANDO_CONFERENCIA: 'destaque',
  EM_CONFERENCIA: 'destaque',
  AGUARDANDO_NF: 'destaque',
  CONCLUIDA: 'neutro',
  CANCELADA: 'erro',
  EXTRAVIADA: 'erro',
  NO_CD_MARKETPLACE: 'atencao',
};
