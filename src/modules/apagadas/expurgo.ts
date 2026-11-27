import { and, asc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, evidencias, itensDevolucao, notasFiscais, notasVenda, retiradasFull } from '@/db/schema';
import { mensagemDoErro } from '@/lib/log';
import { armazenamentoDoProvedor, provedorAtual } from '@/modules/midia/armazenamento';
import { apagarTemporario } from '@/modules/midia/temporarios';
import { PRAZO_APAGADAS_DIAS } from './dominio';

/** Quantas de cada tipo por rodada (uma vez por dia). O resto fica para o dia seguinte. */
export const RODADA_EXPURGO = 200;

const DIA_MS = 24 * 60 * 60 * 1000;

type Arquivo = { caminho: string | null; provedor: string | null; caminhoTemporario: string | null };

/** Um arquivo que não apagou: a transação do item volta, e ele fica para a próxima rodada. */
class FalhaArquivo extends Error {}

function registrarErro(alvo: Record<string, string>, erro: unknown): void {
  console.error(JSON.stringify({ origem: 'worker', tarefa: 'apagadas.expurgo', ...alvo, mensagem: mensagemDoErro(erro) }));
}

/**
 * Apaga os arquivos (no armazenamento do provedor de cada um, E15, e os temporários). Tenta todos; se algum falha, lança
 * no fim (o "apagar" dos três provedores é idempotente: na próxima rodada, o que já sumiu não é erro).
 */
async function apagarArquivos(arquivos: Arquivo[], alvo: Record<string, string>): Promise<void> {
  let falhas = 0;
  for (const a of arquivos) {
    try {
      if (a.caminho) await armazenamentoDoProvedor(a.provedor ?? provedorAtual()).apagar(a.caminho);
      if (a.caminhoTemporario) await apagarTemporario(a.caminhoTemporario);
    } catch (erro) {
      falhas += 1;
      registrarErro(alvo, erro);
    }
  }
  if (falhas > 0) throw new FalhaArquivo(`${falhas} arquivo(s) não apagaram.`);
}

async function apagarEventos(tx: DbOuTx, entidade: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.delete(eventosHistorico).where(and(eq(eventosHistorico.entidade, entidade), inArray(eventosHistorico.entidadeId, ids)));
}

/**
 * Uma devolução. Na transação, com a linha travada, confere de novo que ela ainda está apagada há mais de 90 dias (o
 * Gestor pode ter restaurado agora). Os arquivos saem com a trava: se algum falha, tudo volta e ela fica para amanhã.
 * - Ligada ao ML (origem API ou com `devolucao_externa_id`) ou com NF de devolução (o registro fiscal fica): sobra só a
 *   linha mínima, escondida, com `expurgada_em` e o vínculo da reclamação, para a sincronização não criar outra.
 * - As outras saem de vez (itens, evidências, contestação e NF de venda vão juntas, em cascata).
 * Em qualquer caso saem os itens, as evidências, a contestação, as NFs de venda e o histórico dela e dos itens.
 */
async function expurgarDevolucao(db: Db, id: string, limite: Date, agora: Date): Promise<boolean> {
  const arquivos: Arquivo[] = [];
  return db.transaction(async (tx) => {
    const [d] = await tx
      .select({ id: devolucoes.id, origem: devolucoes.origem, devolucaoExternaId: devolucoes.devolucaoExternaId })
      .from(devolucoes)
      .where(and(eq(devolucoes.id, id), isNotNull(devolucoes.apagadaEm), lt(devolucoes.apagadaEm, limite), isNull(devolucoes.expurgadaEm)))
      .for('update');
    if (!d) return false;
    const itens = await tx.select({ id: itensDevolucao.id, loteId: itensDevolucao.loteId }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, id));
    // Uma unidade que entrou num lote depois de apagada (tarefa dos pendentes) segura a devolução: o lote é físico.
    if (itens.some((i) => i.loteId !== null)) {
      console.warn(JSON.stringify({ origem: 'worker', tarefa: 'apagadas.expurgo', devolucao: id, aviso: 'unidade num lote: fica para depois' }));
      return false;
    }
    const [nota] = await tx.select({ id: notasFiscais.id }).from(notasFiscais).where(eq(notasFiscais.devolucaoId, id)).limit(1);
    const manterLinha = d.origem === 'API' || d.devolucaoExternaId !== null || nota !== undefined;

    const fotos = await tx
      .select({ caminho: evidencias.caminho, provedor: evidencias.provedor, caminhoTemporario: evidencias.caminhoTemporario })
      .from(evidencias)
      .where(eq(evidencias.devolucaoId, id));
    const xmls = await tx.select({ caminho: notasVenda.xmlCaminho }).from(notasVenda).where(eq(notasVenda.devolucaoId, id));
    arquivos.push(...fotos, ...xmls.map((x) => ({ caminho: x.caminho, provedor: null, caminhoTemporario: null })));
    const contestacoes = await tx.select({ id: contestacoesCanal.id }).from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, id));

    await apagarEventos(tx, 'devolucao', [id]);
    await apagarEventos(tx, 'item', itens.map((i) => i.id));
    await apagarEventos(tx, 'contestacao', contestacoes.map((c) => c.id));
    if (manterLinha) {
      await tx.delete(evidencias).where(eq(evidencias.devolucaoId, id));
      await tx.delete(itensDevolucao).where(eq(itensDevolucao.devolucaoId, id));
      await tx.delete(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, id));
      await tx.delete(notasVenda).where(eq(notasVenda.devolucaoId, id));
      await tx.update(devolucoes).set({ expurgadaEm: agora, observacoes: null, atualizadaEm: agora }).where(eq(devolucoes.id, id));
    } else {
      await tx.delete(devolucoes).where(eq(devolucoes.id, id));
    }
    await apagarArquivos(arquivos, { devolucao: id });
    return true;
  });
}

/** Uma retirada: sai de vez, com os itens, as fotos (em cascata) e o histórico. */
async function expurgarRetirada(db: Db, id: string, limite: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select({ id: retiradasFull.id })
      .from(retiradasFull)
      .where(and(eq(retiradasFull.id, id), isNotNull(retiradasFull.apagadaEm), lt(retiradasFull.apagadaEm, limite)))
      .for('update');
    if (!r) return false;
    const fotos = await tx
      .select({ caminho: evidencias.caminho, provedor: evidencias.provedor, caminhoTemporario: evidencias.caminhoTemporario })
      .from(evidencias)
      .where(eq(evidencias.retiradaId, id));
    await apagarEventos(tx, 'retirada_full', [id]);
    await tx.delete(retiradasFull).where(eq(retiradasFull.id, id));
    await apagarArquivos(fotos, { retirada: id });
    return true;
  });
}

/**
 * Tarefa diária `apagadas.expurgo` (extra, emenda E29; spec §9 com os 90 dias das apagadas): apaga de vez o que está na
 * lista Apagadas há mais de 90 dias, com as fotos e os vídeos. Um item que falha não para os outros: o erro vai para o
 * log (sem dados pessoais) e, no fim, a tarefa lança para chegar a Falhas; ele fica para a próxima rodada.
 */
export async function expurgarApagadas(db: Db, agora: Date = new Date()): Promise<{ devolucoes: number; retiradas: number }> {
  const limite = new Date(agora.getTime() - PRAZO_APAGADAS_DIAS * DIA_MS);
  let falhas = 0;
  const contar = async (alvo: Record<string, string>, fazer: () => Promise<boolean>): Promise<number> => {
    try {
      return (await fazer()) ? 1 : 0;
    } catch (erro) {
      falhas += 1;
      if (!(erro instanceof FalhaArquivo)) registrarErro(alvo, erro);
      return 0;
    }
  };

  const devs = await db
    .select({ id: devolucoes.id })
    .from(devolucoes)
    .where(and(isNotNull(devolucoes.apagadaEm), lt(devolucoes.apagadaEm, limite), isNull(devolucoes.expurgadaEm)))
    .orderBy(asc(devolucoes.apagadaEm))
    .limit(RODADA_EXPURGO);
  let totalDevolucoes = 0;
  for (const { id } of devs) totalDevolucoes += await contar({ devolucao: id }, () => expurgarDevolucao(db, id, limite, agora));

  const rets = await db
    .select({ id: retiradasFull.id })
    .from(retiradasFull)
    .where(and(isNotNull(retiradasFull.apagadaEm), lt(retiradasFull.apagadaEm, limite)))
    .orderBy(asc(retiradasFull.apagadaEm))
    .limit(RODADA_EXPURGO);
  let totalRetiradas = 0;
  for (const { id } of rets) totalRetiradas += await contar({ retirada: id }, () => expurgarRetirada(db, id, limite));

  if (falhas > 0) throw new Error(`Apagadas: ${falhas} item(ns) não puderam ser apagados de vez.`);
  return { devolucoes: totalDevolucoes, retiradas: totalRetiradas };
}

