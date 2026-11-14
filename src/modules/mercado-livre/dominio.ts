/**
 * Vocabulário do Mercado Livre (spec §7, contrato §4.2). Sem imports com "@/": o schema importa este arquivo e o
 * drizzle-kit não resolve o alias. Os dois imports abaixo são só de tipo (apagados na compilação).
 */
import type { MotivoCanal } from '../../conectores/marketplace/tipos';
import type { MotivoItem } from '../devolucoes/dominio';

/** Conta do marketplace (spec §7.1): ATIVA ⇄ RECONECTAR. */
export const SITUACOES_CONTA = ['ATIVA', 'RECONECTAR'] as const;
export type SituacaoConta = (typeof SITUACOES_CONTA)[number];
export const ROTULO_SITUACAO_CONTA: Record<SituacaoConta, string> = { ATIVA: 'Ativa', RECONECTAR: 'Reconectar' };

/** Contestação (contrato §4.6): AGUARDANDO_GESTOR → ENVIADA ou FALHOU; FALHOU → AGUARDANDO_GESTOR. */
export const STATUS_CONTESTACAO = ['AGUARDANDO_GESTOR', 'ENVIADA', 'FALHOU'] as const;
export type StatusContestacao = (typeof STATUS_CONTESTACAO)[number];
export const ROTULO_STATUS_CONTESTACAO: Record<StatusContestacao, string> = {
  AGUARDANDO_GESTOR: 'Aguardando o Gestor',
  ENVIADA: 'Enviada ao ML',
  FALHOU: 'Com falha',
};
export function ehStatusContestacao(texto: string): texto is StatusContestacao {
  return (STATUS_CONTESTACAO as readonly string[]).includes(texto);
}

/** Motivos da "revisão com problema" do ML (spec §7.4). */
export const MOTIVOS_CANAL = ['SRF2', 'SRF3', 'SRF4', 'SRF5', 'SRF6'] as const satisfies readonly MotivoCanal[];
export const ROTULO_MOTIVO_CANAL: Record<MotivoCanal, string> = {
  SRF2: 'Produto avariado',
  SRF3: 'Produto incompleto',
  SRF4: 'Produto diferente do anunciado',
  SRF5: 'Produto não veio no pacote',
  SRF6: 'Usado, com defeito ou outro motivo',
};
/** Spec §7.4: avariado (SRF2) e divergente (SRF4) exigem anexo. */
export const MOTIVOS_COM_FOTO_OBRIGATORIA: readonly MotivoCanal[] = ['SRF2', 'SRF4'];
export function ehMotivoCanal(texto: string): texto is MotivoCanal {
  return (MOTIVOS_CANAL as readonly string[]).includes(texto);
}

const MOTIVO_CANAL_DO_ITEM: Record<MotivoItem, MotivoCanal> = {
  AVARIADO: 'SRF2',
  INCOMPLETO: 'SRF3',
  DIVERGENTE: 'SRF4',
  AUSENTE: 'SRF5',
  USADO: 'SRF6',
  COM_DEFEITO: 'SRF6',
  OUTRO: 'SRF6',
};

/** Tradução do motivo do item para o motivo do ML (spec §7.4, contrato §5.4). */
export function motivoCanalML(m: MotivoItem): MotivoCanal {
  return MOTIVO_CANAL_DO_ITEM[m];
}

/** Spec §6.0.1 e §11: alerta quando a última sincronização bem-sucedida tem mais de 1 hora. */
export const LIMITE_SEM_SINCRONIZAR_MS = 60 * 60 * 1000;
export function sincronizacaoAtrasada(ultima: Date | null, agora: Date): boolean {
  return ultima === null || agora.getTime() - ultima.getTime() > LIMITE_SEM_SINCRONIZAR_MS;
}

/** `return.status` do ML (spec §7.3) em português. */
const ROTULO_STATUS_ML: Record<string, string> = {
  pending: 'Aguardando postagem',
  label_generated: 'Etiqueta gerada',
  scheduled: 'Coleta agendada',
  shipped: 'A caminho',
  pending_delivered: 'Entrega em andamento',
  delivered: 'Entregue',
  cancelled: 'Cancelada no ML',
  pending_cancel: 'Cancelamento em andamento',
  expired: 'Expirada',
  pending_expiration: 'Expirando',
  return_to_buyer: 'Voltando ao comprador',
  not_delivered: 'Não entregue',
  failed: 'Falhou no ML',
  pending_failure: 'Falha em andamento',
  closed: 'Encerrada no ML',
};

/** `statusCanal` é "<return.status>/<status do envio>" (decisão 2 do plano): o rótulo vem do status da devolução. */
export function rotuloStatusML(statusCanal: string | null): string {
  if (!statusCanal) return '—';
  const devolucao = statusCanal.split('/')[0];
  return ROTULO_STATUS_ML[devolucao] ?? devolucao;
}
