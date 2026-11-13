import { and, desc, eq, inArray } from 'drizzle-orm';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, reclamacoesMl } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { ehMotivoCanal, type StatusContestacao } from './dominio';

export type ResultadoNoML =
  | { tipo: 'ok'; em: Date }
  | { tipo: 'ok_recusado'; em: Date; erro: string }
  | { tipo: 'sem_vinculo'; em: Date }
  | { tipo: 'contestacao'; id: string; status: StatusContestacao; enviando: boolean; motivo: MotivoCanal };

export type ResumoMLDevolucao = {
  vinculada: boolean;
  reclamacaoId: string | null;
  devolucaoExternaId: string | null;
  statusCanal: string | null;
  entregueEm: Date | null;
  prazo: Date | null;
  sincronizadaEm: Date | null;
  resultado: ResultadoNoML | null;
};

const ACOES_RESULTADO = ['ml_resultado_ok_enviado', 'ml_resultado_ok_recusado', 'ml_resultado_sem_vinculo'];

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
    .select({ sincronizadaEm: reclamacoesMl.sincronizadaEm })
    .from(reclamacoesMl)
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
  }
  return {
    vinculada: d.devolucaoExternaId !== null,
    reclamacaoId: d.reclamacaoId,
    devolucaoExternaId: d.devolucaoExternaId,
    statusCanal: d.statusCanal,
    entregueEm: d.entregueEm,
    prazo: d.prazo,
    sincronizadaEm: reclamacao?.sincronizadaEm ?? null,
    resultado,
  };
}
