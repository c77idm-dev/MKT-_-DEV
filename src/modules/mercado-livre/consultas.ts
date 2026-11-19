import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import type { ExtrasML } from '@/conectores/marketplace/mercadolivre/tipos';
import { contasBitbrain, contestacoesCanal, devolucoes, eventosHistorico, reclamacoesMl } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { configML, faltasConfigML, type ConfigML, type ModoML } from './config';
import { obterContaML, type ContaML } from './contas';
import { ehMotivoCanal, sincronizacaoAtrasada, type StatusContestacao } from './dominio';

export type ResultadoNoML =
  | { tipo: 'ok'; em: Date }
  | { tipo: 'ok_recusado'; em: Date; erro: string }
  | { tipo: 'sem_vinculo'; em: Date }
  | { tipo: 'ok_pendente_manual'; em: Date }
  | { tipo: 'ok_respondido_a_mao'; em: Date }
  | { tipo: 'contestacao'; id: string; status: StatusContestacao; enviando: boolean; motivo: MotivoCanal };

export type ResumoMLDevolucao = {
  vinculada: boolean;
  reclamacaoId: string | null;
  devolucaoExternaId: string | null;
  statusCanal: string | null;
  entregueEm: Date | null;
  prazo: Date | null;
  sincronizadaEm: Date | null;
  /** Nome da conta do Bitbrain (ou a empresa); null no modo api. */
  conta: string | null;
  /** Os 5 extras (§4.5); null sem reclamação gravada. */
  extras: ExtrasML | null;
  resultado: ResultadoNoML | null;
};

const ACOES_RESULTADO = ['ml_resultado_ok_enviado', 'ml_resultado_ok_recusado', 'ml_resultado_sem_vinculo', 'ml_resposta_manual_pendente', 'ml_ok_respondido_a_mao'];

/** O que a seção "Mercado Livre" do detalhe mostra. Null quando a devolução não é do ML. */
export async function resumoMLDaDevolucao(db: DbOuTx, devolucaoId: string): Promise<ResumoMLDevolucao | null> {
  if (!ehUuid(devolucaoId)) return null;
  const [d] = await db
    .select({
      canal: devolucoes.canal,
      reclamacaoId: devolucoes.reclamacaoId,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      statusCanal: devolucoes.statusCanal,
      entregueEm: devolucoes.entregueSegundoCanalEm,
      prazo: devolucoes.prazoConferenciaCanal,
    })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId));
  if (!d || d.canal !== 'MERCADO_LIVRE') return null;
  const [reclamacao] = await db
    .select({
      sincronizadaEm: reclamacoesMl.sincronizadaEm,
      conta: sql<string | null>`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})`,
      acaoPendente: reclamacoesMl.acaoPendente,
      urgente: reclamacoesMl.urgente,
      afetaReputacao: reclamacoesMl.afetaReputacao,
      ehFull: reclamacoesMl.ehFull,
      triagemCondicao: reclamacoesMl.triagemCondicao,
      triagemEtapa: reclamacoesMl.triagemEtapa,
      dinheiro: reclamacoesMl.dinheiro,
    })
    .from(reclamacoesMl)
    .leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))
    .where(eq(reclamacoesMl.devolucaoId, devolucaoId))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(1);
  const [c] = await db
    .select({ id: contestacoesCanal.id, status: contestacoesCanal.status, revisadoPor: contestacoesCanal.revisadoPor, motivo: contestacoesCanal.motivoCanal })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.devolucaoId, devolucaoId));
  const [evento] = await db
    .select({ acao: eventosHistorico.acao, em: eventosHistorico.em, dados: eventosHistorico.dados })
    .from(eventosHistorico)
    .where(and(eq(eventosHistorico.entidade, 'devolucao'), eq(eventosHistorico.entidadeId, devolucaoId), inArray(eventosHistorico.acao, ACOES_RESULTADO)))
    .orderBy(desc(eventosHistorico.id))
    .limit(1);

  let resultado: ResultadoNoML | null = null;
  if (c) {
    resultado = {
      tipo: 'contestacao',
      id: c.id,
      status: c.status,
      enviando: c.status === 'AGUARDANDO_GESTOR' && c.revisadoPor !== null,
      motivo: ehMotivoCanal(c.motivo) ? c.motivo : 'SRF6',
    };
  } else if (evento?.acao === 'ml_resultado_ok_enviado') {
    resultado = { tipo: 'ok', em: evento.em };
  } else if (evento?.acao === 'ml_resultado_ok_recusado') {
    const erro = evento.dados?.erro;
    resultado = { tipo: 'ok_recusado', em: evento.em, erro: typeof erro === 'string' ? erro : 'sem detalhes' };
  } else if (evento?.acao === 'ml_resultado_sem_vinculo') {
    resultado = { tipo: 'sem_vinculo', em: evento.em };
  } else if (evento?.acao === 'ml_resposta_manual_pendente') {
    resultado = { tipo: 'ok_pendente_manual', em: evento.em };
  } else if (evento?.acao === 'ml_ok_respondido_a_mao') {
    resultado = { tipo: 'ok_respondido_a_mao', em: evento.em };
  }
  return {
    vinculada: d.devolucaoExternaId !== null,
    reclamacaoId: d.reclamacaoId,
    devolucaoExternaId: d.devolucaoExternaId,
    statusCanal: d.statusCanal,
    entregueEm: d.entregueEm,
    prazo: d.prazo,
    sincronizadaEm: reclamacao?.sincronizadaEm ?? null,
    conta: reclamacao?.conta ?? null,
    extras: reclamacao
      ? {
          acaoPendente: reclamacao.acaoPendente,
          urgente: reclamacao.urgente,
          afetaReputacao: reclamacao.afetaReputacao,
          ehFull: reclamacao.ehFull,
          triagemCondicao: reclamacao.triagemCondicao,
          triagemEtapa: reclamacao.triagemEtapa,
          dinheiro: reclamacao.dinheiro,
        }
      : null,
    resultado,
  };
}

export type ResumoContaML = {
  conta: ContaML | null;
  modo: ModoML;
  faltas: string[];
  sincronizacaoAtrasada: boolean;
  redirectUri: string;
  urlNotificacoes: string | null;
};

/**
 * Tela Configurações › Mercado Livre. O atraso conta desde a última varredura, ou desde a conexão quando ainda não
 * houve nenhuma (logo depois de conectar não é "parada").
 */
export async function resumoContaML(db: DbOuTx, config: ConfigML = configML(), agora: Date = new Date()): Promise<ResumoContaML> {
  const conta = await obterContaML(db);
  let urlNotificacoes: string | null = null;
  try {
    urlNotificacoes = config.redirectUri ? new URL('/api/ml/notificacoes', config.redirectUri).toString() : null;
  } catch {
    urlNotificacoes = null;
  }
  return {
    conta,
    modo: config.modo,
    faltas: faltasConfigML(config),
    sincronizacaoAtrasada: conta !== null && conta.situacao === 'ATIVA' && sincronizacaoAtrasada(conta.ultimaSincronizacaoEm ?? conta.conectadaEm, agora),
    redirectUri: config.redirectUri,
    urlNotificacoes,
  };
}

export type ConsultaSemEnvio = { reclamacaoId: string; returnId: string | null; statusDevolucao: string | null; sincronizadaEm: Date };

/** D10: devoluções low_cost (sem envio físico), só para consulta. */
export async function listarSemEnvioFisico(db: DbOuTx, limite = 50): Promise<ConsultaSemEnvio[]> {
  return db
    .select({
      reclamacaoId: reclamacoesMl.claimId,
      returnId: reclamacoesMl.returnId,
      statusDevolucao: reclamacoesMl.statusDevolucao,
      sincronizadaEm: reclamacoesMl.sincronizadaEm,
    })
    .from(reclamacoesMl)
    .where(eq(reclamacoesMl.subtipo, 'low_cost'))
    .orderBy(desc(reclamacoesMl.sincronizadaEm))
    .limit(limite);
}
