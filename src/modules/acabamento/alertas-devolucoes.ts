import { and, eq, gt, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, itensDevolucao, lotes, notasFiscais } from '@/db/schema';
import { devolucaoIdVisivel, devolucaoVisivel } from '@/modules/apagadas/filtro';
import { STATUS_ML_CANCELAMENTO, STATUS_ML_EXTRAVIO } from '@/modules/mercado-livre/status';
import { diasUteisDepois, JANELA_ALERTA_EVENTO_MS, prazoVencendo } from './alertas-regras';

const ANTES_DA_CONFERENCIA = ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA'] as const;

/** Prazo do ML em até 24 h (ou vencido), só antes da conferência (decisão 11). */
export async function devolucoesComPrazoVencendo(db: DbOuTx, agora: Date): Promise<string[]> {
  const linhas = await db
    .select({ id: devolucoes.id, prazo: devolucoes.prazoConferenciaCanal })
    .from(devolucoes)
    .where(and(inArray(devolucoes.status, [...ANTES_DA_CONFERENCIA]), isNotNull(devolucoes.prazoConferenciaCanal), devolucaoVisivel));
  return linhas.filter((l) => l.prazo && prazoVencendo(l.prazo, agora)).map((l) => l.id);
}

/** Contestações AGUARDANDO_GESTOR ou FALHOU com prazo vencendo (ENVIADA conta como resolvida). */
export async function contestacoesComPrazoVencendo(db: DbOuTx, agora: Date): Promise<{ id: string; devolucaoCodigo: string }[]> {
  const linhas = await db
    .select({ id: contestacoesCanal.id, devolucaoCodigo: devolucoes.codigo, prazo: contestacoesCanal.prazo })
    .from(contestacoesCanal)
    .innerJoin(devolucoes, eq(devolucoes.id, contestacoesCanal.devolucaoId))
    .where(and(inArray(contestacoesCanal.status, ['AGUARDANDO_GESTOR', 'FALHOU']), isNotNull(contestacoesCanal.prazo), devolucaoVisivel));
  return linhas.filter((l) => l.prazo && prazoVencendo(l.prazo, agora)).map(({ id, devolucaoCodigo }) => ({ id, devolucaoCodigo }));
}

/** NF rejeitada de devolução (ids das devoluções) e de remessa (códigos dos lotes). */
export async function notasRejeitadas(db: DbOuTx): Promise<{ devolucaoIds: string[]; lotes: { codigo: string }[] }> {
  const linhas = await db
    .select({ devolucaoId: notasFiscais.devolucaoId, loteCodigo: lotes.codigo })
    .from(notasFiscais)
    .leftJoin(lotes, eq(lotes.id, notasFiscais.loteId))
    // (extra, E29) A NF rejeitada da devolução apagada não vira alerta (a de remessa não tem devolução).
    .leftJoin(devolucoes, eq(devolucoes.id, notasFiscais.devolucaoId))
    .where(and(eq(notasFiscais.situacao, 'REJEITADA'), devolucaoVisivel));
  const devolucaoIds = [...new Set(linhas.flatMap((l) => (l.devolucaoId ? [l.devolucaoId] : [])))];
  const codigos = [...new Set(linhas.flatMap((l) => (l.loteCodigo ? [l.loteCodigo] : [])))].sort();
  return { devolucaoIds, lotes: codigos.map((codigo) => ({ codigo })) };
}

export async function contarSemFornecedor(db: DbOuTx): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .where(and(eq(itensDevolucao.status, 'SEM_FORNECEDOR'), devolucaoVisivel));
  return total;
}

/** (extra) PENDENTE_CHEGADA, entregue pelo canal há 2 dias úteis ou mais (decisão 12). */
export async function devolucoesEntreguesSemLeitura(db: DbOuTx, agora: Date): Promise<string[]> {
  const linhas = await db
    .select({ id: devolucoes.id, entregue: devolucoes.entregueSegundoCanalEm })
    .from(devolucoes)
    .where(and(eq(devolucoes.status, 'PENDENTE_CHEGADA'), isNotNull(devolucoes.entregueSegundoCanalEm), devolucaoVisivel));
  return linhas.filter((l) => l.entregue && diasUteisDepois(l.entregue, agora) >= 2).map((l) => l.id);
}

/** Entidades com um evento `acao` nos últimos 7 dias (decisão 10). O índice (acao, em) atende. */
async function entidadesComEventoRecente(db: DbOuTx, entidade: 'devolucao' | 'lote', acao: string, agora: Date, extra?: SQL): Promise<string[]> {
  const desde = new Date(agora.getTime() - JANELA_ALERTA_EVENTO_MS);
  const linhas = await db
    .selectDistinct({ id: eventosHistorico.entidadeId })
    .from(eventosHistorico)
    .where(
      and(
        eq(eventosHistorico.entidade, entidade),
        eq(eventosHistorico.acao, acao),
        gt(eventosHistorico.em, desde),
        extra,
        // (extra, E29) O alerta da devolução apagada some com ela.
        entidade === 'devolucao' ? devolucaoIdVisivel(eventosHistorico.entidadeId) : undefined,
      ),
    );
  return linhas.map((l) => l.id);
}

/** Decisão 10: só cancelamento ou extravio no ML; "delivered" depois da leitura física é a vida normal. */
export async function devolucoesComMLEncerradoAposChegada(db: DbOuTx, agora: Date): Promise<string[]> {
  const encerrados = [...STATUS_ML_CANCELAMENTO, ...STATUS_ML_EXTRAVIO];
  const lista = sql.join(
    encerrados.map((s) => sql`${s}`),
    sql`, `,
  );
  return entidadesComEventoRecente(db, 'devolucao', 'ml_status_apos_chegada', agora, sql`split_part(${eventosHistorico.dados}->>'statusCanal', '/', 1) in (${lista})`);
}

export async function devolucoesComAlertaLote(db: DbOuTx, agora: Date): Promise<string[]> {
  return entidadesComEventoRecente(db, 'devolucao', 'lote_alerta_nf_cancelada', agora);
}

export async function lotesComAlertaNfCancelada(db: DbOuTx, agora: Date): Promise<{ codigo: string }[]> {
  const ids = await entidadesComEventoRecente(db, 'lote', 'lote_alerta_nf_cancelada', agora);
  if (ids.length === 0) return [];
  return db.select({ codigo: lotes.codigo }).from(lotes).where(inArray(lotes.id, ids)).orderBy(lotes.codigo);
}
