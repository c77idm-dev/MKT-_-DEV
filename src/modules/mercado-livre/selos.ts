import { formatarDataHora, formatarDiaMes } from '@/lib/formatar';
import type { DadosSelo, TomSelo } from '@/modules/devolucoes/selos';
import { SELO_AFETA_REPUTACAO, SELO_FULL, SELO_URGENTE, type AfetaReputacao, type StatusContestacao } from './dominio';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Spec §6.6: o prazo do ML em destaque; vermelho quando falta 1 dia ou menos (horário de Brasília). */
export function seloPrazoML(prazo: Date | null, agora: Date): DadosSelo | null {
  if (!prazo) return null;
  const resta = prazo.getTime() - agora.getTime();
  if (resta < 0) return { texto: 'Prazo do ML vencido', tom: 'erro' };
  return { texto: `Prazo ${formatarDataHora(prazo)}`, tom: resta <= UM_DIA_MS ? 'erro' : 'atencao' };
}

export const TOM_STATUS_CONTESTACAO: Record<StatusContestacao, TomSelo> = {
  AGUARDANDO_GESTOR: 'atencao',
  ENVIADA: 'bom',
  FALHOU: 'erro',
};

export type EntradaSelosML = { urgente: boolean | null; afetaReputacao: AfetaReputacao | null; ehFull: boolean | null };

/** §4.5: no cartão, nas listas das etapas e na Busca, só os extras que importam: Urgente, Afeta reputação e Full. */
export function selosExtrasML(e: EntradaSelosML, prazo: Date | null): DadosSelo[] {
  const selos: DadosSelo[] = [];
  if (e.urgente) selos.push({ texto: prazo ? `${SELO_URGENTE} · até ${formatarDiaMes(prazo)}` : SELO_URGENTE, tom: 'erro' });
  if (e.afetaReputacao === 'AFETA') selos.push({ texto: SELO_AFETA_REPUTACAO, tom: 'atencao' });
  if (e.ehFull) selos.push({ texto: SELO_FULL, tom: 'destaque' });
  return selos;
}
