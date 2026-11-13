import { formatarDataHora } from '@/lib/formatar';
import type { DadosSelo, TomSelo } from '@/modules/devolucoes/selos';
import type { StatusContestacao } from './dominio';

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
