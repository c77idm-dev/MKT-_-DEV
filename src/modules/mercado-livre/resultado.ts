import { and, asc, eq, inArray, isNull, like, notInArray, or, sql } from 'drizzle-orm';
import { ehRecusaDefinitiva, logErroML, mensagemErroML } from '@/conectores/marketplace/mercadolivre/erros';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, evidencias, itensDevolucao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import type { DestinoItem, MotivoItem, StatusItem } from '@/modules/devolucoes/dominio';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterConectorML } from './conector';
import { ErroContaML } from './contas';
import { motivoCanalML } from './dominio';

export type ItemConferido = {
  id: string;
  unidade: number;
  sku: string;
  status: StatusItem;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};
export type Decisao = { tipo: 'OK' } | { tipo: 'CONTESTAR'; motivo: MotivoCanal; itensProblema: ItemConferido[] };

/** Suposição A9 do plano: limites do ML para a mensagem e para o número de fotos. */
export const LIMITE_MENSAGEM = 2000;
export const MAX_FOTOS_CONTESTACAO = 10;
/** Vão ao ML só fotos (spec §7.4: o vídeo fica no sistema como prova). */
export const TIPOS_FOTO_CONTESTACAO = ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM', 'FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL', 'EXTRA'] as const;

/** Texto do motivo do item na mensagem ao ML (minúsculo, no meio da frase). */
export const TEXTO_MOTIVO_ITEM: Record<MotivoItem, string> = {
  AVARIADO: 'avariado',
  USADO: 'usado',
  DIVERGENTE: 'diferente do anunciado',
  INCOMPLETO: 'incompleto',
  COM_DEFEITO: 'com defeito',
  AUSENTE: 'não veio no pacote',
  OUTRO: 'outro problema',
};

function motivoDoItem(i: ItemConferido): MotivoItem | null {
  if (i.status === 'AUSENTE' || i.motivo === 'AUSENTE') return 'AUSENTE';
  if (i.destino === 'PROBLEMA') return i.motivo ?? 'OUTRO';
  return null;
}

/** Spec §6.3 e contrato §5.4: todos BOM → OK; algum PROBLEMA ou AUSENTE → contestação com o motivo do 1º item com problema (D8). */
export function decidirResultado(itens: ItemConferido[]): Decisao {
  const problemas = [...itens].sort((a, b) => a.unidade - b.unidade).filter((i) => motivoDoItem(i) !== null);
  const primeiro = problemas[0];
  if (!primeiro) return { tipo: 'OK' };
  return { tipo: 'CONTESTAR', motivo: motivoCanalML(motivoDoItem(primeiro) ?? 'OUTRO'), itensProblema: problemas };
}

/** Texto inicial da contestação; o Gestor edita antes de enviar (D8). */
export function mensagemContestacao(p: { codigo: string; itensProblema: ItemConferido[]; fotos: number }): string {
  const linhas = p.itensProblema.map((i) => {
    const observacao = i.observacao?.trim() ? ` ${i.observacao.trim()}` : '';
    return `- Unidade ${i.unidade} (SKU ${i.sku}): ${TEXTO_MOTIVO_ITEM[motivoDoItem(i) ?? 'OUTRO']}.${observacao}`;
  });
  const texto = [`Na conferência da devolução ${p.codigo} encontramos:`, ...linhas, ...(p.fotos > 0 ? ['As fotos da conferência estão anexadas.'] : [])].join('\n');
  return texto.length > LIMITE_MENSAGEM ? `${texto.slice(0, LIMITE_MENSAGEM - 1)}…` : texto;
}

/** Fotos 1 e 2, Fotos 3 e 4 dos itens com problema, e extras; sem as que falharam (decisão 7 do plano). */
export async function fotosParaContestacao(db: DbOuTx, devolucaoId: string, itensProblemaIds: string[]): Promise<string[]> {
  const linhas = await db
    .select({ id: evidencias.id })
    .from(evidencias)
    .where(
      and(
        eq(evidencias.devolucaoId, devolucaoId),
        inArray(evidencias.tipo, [...TIPOS_FOTO_CONTESTACAO]),
        like(evidencias.tipoConteudo, 'image/%'),
        notInArray(evidencias.situacaoProcessamento, ['FALHOU', 'APAGADA']),
        itensProblemaIds.length > 0 ? or(isNull(evidencias.itemId), inArray(evidencias.itemId, itensProblemaIds)) : isNull(evidencias.itemId),
      ),
    )
    .orderBy(asc(evidencias.tipo), asc(evidencias.enviadoEm))
    .limit(MAX_FOTOS_CONTESTACAO);
  return linhas.map((l) => l.id);
}

async function jaTemEvento(db: DbOuTx, devolucaoId: string, acao: string): Promise<boolean> {
  const [e] = await db
    .select({ id: eventosHistorico.id })
    .from(eventosHistorico)
    .where(and(eq(eventosHistorico.entidade, 'devolucao'), eq(eventosHistorico.entidadeId, devolucaoId), eq(eventosHistorico.acao, acao)))
    .limit(1);
  return e !== undefined;
}

export type ResultadoProcessamento =
  | 'sem_devolucao'
  | 'outro_canal'
  | 'sem_vinculo'
  | 'ok_enviado'
  | 'ok_ja_enviado'
  | 'ok_recusado'
  | 'contestacao_criada'
  | 'contestacao_existente';

/**
 * Tarefa ml.enviar-resultado (contrato §5.4), enviada pela Fase 2 ao concluir a conferência. Idempotente:
 * - o "OK" vai uma vez (trava por devolução e o evento ml_resultado_ok_enviado);
 * - a contestação é uma por devolução (índice único).
 * Lança (nova tentativa) só em erro passageiro ou sem conta conectada.
 */
export async function processarResultadoConferencia(db: DbOuTx, devolucaoId: string, agora: Date): Promise<ResultadoProcessamento> {
  if (!ehUuid(devolucaoId)) return 'sem_devolucao';
  const [dev] = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      canal: devolucoes.canal,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      prazo: devolucoes.prazoConferenciaCanal,
    })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId));
  if (!dev) return 'sem_devolucao';
  if (dev.canal !== 'MERCADO_LIVRE') return 'outro_canal';
  const devolucaoExternaId = dev.devolucaoExternaId;
  if (!devolucaoExternaId) {
    if (!(await jaTemEvento(db, dev.id, 'ml_resultado_sem_vinculo'))) {
      await registrarEvento(db, { entidade: 'devolucao', entidadeId: dev.id, acao: 'ml_resultado_sem_vinculo', usuarioId: null, em: agora });
    }
    return 'sem_vinculo';
  }

  const itens = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
    })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, dev.id))
    .orderBy(asc(itensDevolucao.unidade));
  const decisao = decidirResultado(itens);

  if (decisao.tipo === 'CONTESTAR') {
    const fotos = await fotosParaContestacao(
      db,
      dev.id,
      decisao.itensProblema.map((i) => i.id),
    );
    return db.transaction(async (tx): Promise<ResultadoProcessamento> => {
      const [nova] = await tx
        .insert(contestacoesCanal)
        .values({
          devolucaoId: dev.id,
          motivoCanal: decisao.motivo,
          mensagem: mensagemContestacao({ codigo: dev.codigo, itensProblema: decisao.itensProblema, fotos: fotos.length }),
          evidencias: fotos,
          prazo: dev.prazo,
          criadaEm: agora,
          atualizadaEm: agora,
        })
        .onConflictDoNothing({ target: contestacoesCanal.devolucaoId })
        .returning({ id: contestacoesCanal.id });
      if (!nova) return 'contestacao_existente';
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: dev.id,
        acao: 'contestacao_criada',
        usuarioId: null,
        dados: { contestacaoId: nova.id, motivo: decisao.motivo, fotos: fotos.length },
        em: agora,
      });
      return 'contestacao_criada';
    });
  }

  return db.transaction(async (tx): Promise<ResultadoProcessamento> => {
    await tx.execute(sql`select pg_advisory_xact_lock(3, hashtext(${`resultado:${dev.id}`}))`);
    if (await jaTemEvento(tx, dev.id, 'ml_resultado_ok_enviado')) return 'ok_ja_enviado';
    const conector = await obterConectorML(db);
    if (!conector) throw new ErroContaML('A conta do Mercado Livre não está conectada: o "OK" vai quando ela voltar.');
    try {
      await conector.enviarResultadoConferencia(devolucaoExternaId, { tipo: 'OK' });
    } catch (erro) {
      if (!ehRecusaDefinitiva(erro)) throw erro;
      logErroML('resultado OK', erro, { devolucaoId: dev.id });
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: dev.id,
        acao: 'ml_resultado_ok_recusado',
        usuarioId: null,
        dados: { erro: mensagemErroML(erro) },
        em: agora,
      });
      return 'ok_recusado';
    }
    await registrarEvento(tx, { entidade: 'devolucao', entidadeId: dev.id, acao: 'ml_resultado_ok_enviado', usuarioId: null, em: agora });
    return 'ok_enviado';
  });
}
