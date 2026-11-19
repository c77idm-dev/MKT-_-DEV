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

/** Extras do ML (integração Bitbrain §4.5), nos modos api e bitbrain. Nulo = o ML não informou. */
export const AFETA_REPUTACAO = ['AFETA', 'NAO_AFETA', 'NAO_SE_APLICA'] as const;
export type AfetaReputacao = (typeof AFETA_REPUTACAO)[number];
export const AFETA_REPUTACAO_DO_ML: Record<string, AfetaReputacao> = { affected: 'AFETA', not_affected: 'NAO_AFETA', not_applies: 'NAO_SE_APLICA' };
export const ROTULO_AFETA_REPUTACAO: Record<AfetaReputacao, string> = {
  AFETA: 'Afeta a reputação',
  NAO_AFETA: 'Não afeta a reputação',
  NAO_SE_APLICA: 'Não se aplica',
};

export const CONDICOES_TRIAGEM = ['VENDAVEL', 'NAO_VENDAVEL', 'DESCARTE', 'FALTANDO'] as const;
export type CondicaoTriagem = (typeof CONDICOES_TRIAGEM)[number];
export const CONDICAO_TRIAGEM_DO_ML: Record<string, CondicaoTriagem> = {
  saleable: 'VENDAVEL',
  unsaleable: 'NAO_VENDAVEL',
  discard: 'DESCARTE',
  missing: 'FALTANDO',
};
export const ROTULO_CONDICAO_TRIAGEM: Record<CondicaoTriagem, string> = {
  VENDAVEL: 'Vendável',
  NAO_VENDAVEL: 'Não vendável',
  DESCARTE: 'Descarte',
  FALTANDO: 'Faltando',
};

export const SITUACOES_DINHEIRO = ['RETIDO', 'DEVOLVIDO', 'LIBERADO'] as const;
export type SituacaoDinheiro = (typeof SITUACOES_DINHEIRO)[number];
export const DINHEIRO_DO_ML: Record<string, SituacaoDinheiro> = { retained: 'RETIDO', refunded: 'DEVOLVIDO', available: 'LIBERADO' };
export const ROTULO_DINHEIRO: Record<SituacaoDinheiro, string> = { RETIDO: 'retido', DEVOLVIDO: 'devolvido ao comprador', LIBERADO: 'liberado' };

/** Selos do cartão, das listas e da Busca: só os extras que importam (§4.5). */
export const SELO_URGENTE = 'Urgente';
export const SELO_AFETA_REPUTACAO = 'Afeta reputação';
export const SELO_FULL = 'Full';

const ROTULO_ACAO_ML: Record<string, string> = {
  return_review: 'Revisar a devolução',
  return_review_ok: 'Revisar a devolução',
  return_review_fail: 'Revisar a devolução',
  send_message_to_complainant: 'Responder ao comprador',
  send_message_to_mediator: 'Responder à mediação',
  refund: 'Devolver o dinheiro',
  allow_return: 'Aceitar a devolução',
  open_dispute: 'Abrir disputa',
};
/** Ação pendente da loja no ML, em português; ação desconhecida aparece crua. */
export function rotuloAcaoML(acao: string | null): string {
  if (!acao) return '—';
  return ROTULO_ACAO_ML[acao] ?? acao;
}

/** Suposição A17: a etapa da triagem do ML. */
const ROTULO_ETAPA_TRIAGEM: Record<string, string> = { pending: 'em andamento', closed: 'concluída' };
export function rotuloEtapaTriagem(etapa: string | null): string | null {
  if (!etapa) return null;
  return ROTULO_ETAPA_TRIAGEM[etapa] ?? etapa;
}

/** Modo bitbrain (§4.6): o "OK" que falta responder no ML à mão. A contestação tem a tabela dela. */
export const RESPOSTAS_PENDENTES = ['OK'] as const;
export type RespostaPendente = (typeof RESPOSTAS_PENDENTES)[number];
