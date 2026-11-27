import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { eventosHistorico, evidencias, itensRetiradaFull, produtos, retiradasFull, usuarios } from '@/db/schema';
import { retiradaVisivel } from '@/modules/apagadas/filtro';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';
import type { SituacaoRetirada } from './dominio';

export const POR_PAGINA_RETIRADAS = 20;

export type RetiradaLista = {
  id: string;
  codigo: string;
  codigoEtiqueta: string;
  situacao: SituacaoRetirada;
  recebidaEm: Date;
  concluidaEm: Date | null;
  recebidaPorNome: string | null;
  /** Soma das quantidades. */
  totalItens: number;
};

const TOTAL_ITENS = sql<number>`coalesce((select sum(i."quantidade") from "itens_retirada_full" i where i."retirada_id" = "retiradas_full"."id"), 0)::int`;

const COLUNAS_LISTA = {
  id: retiradasFull.id,
  codigo: retiradasFull.codigo,
  codigoEtiqueta: retiradasFull.codigoEtiqueta,
  situacao: retiradasFull.situacao,
  recebidaEm: retiradasFull.recebidaEm,
  concluidaEm: retiradasFull.concluidaEm,
  recebidaPorNome: usuarios.nome,
  totalItens: TOTAL_ITENS,
};

/** Lista "Retiradas do Full": a mais nova primeiro. (extra, E29) Sem as apagadas. */
export async function listarRetiradas(
  db: DbOuTx,
  opcoes: { pagina: number; porPagina?: number },
): Promise<{ retiradas: RetiradaLista[]; total: number }> {
  const porPagina = opcoes.porPagina ?? POR_PAGINA_RETIRADAS;
  const pagina = Math.max(1, opcoes.pagina);
  const [{ total }] = await db.select({ total: count() }).from(retiradasFull).where(retiradaVisivel);
  const retiradas = await db
    .select(COLUNAS_LISTA)
    .from(retiradasFull)
    .leftJoin(usuarios, eq(usuarios.id, retiradasFull.recebidaPor))
    .where(retiradaVisivel)
    .orderBy(desc(retiradasFull.numero))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  return { retiradas, total };
}

export type ItemRetiradaVista = {
  id: string;
  produtoId: string | null;
  sku: string | null;
  /** A do cadastro, ou a descrição curta do item "sem cadastro". */
  descricao: string;
  eanLido: string | null;
  quantidade: number;
  semCadastro: boolean;
};

export type EvidenciaRetirada = {
  id: string;
  tipo: TipoEvidencia;
  /** O item da retirada (foto opcional do item); null = foto da etiqueta. */
  itemId: string | null;
  situacao: SituacaoProcessamento;
  caminho: string | null;
  provedor: string | null;
  erro: string | null;
};

/** `chegadasEtiquetaAmarela` (extra, E27): as chegadas de devoluções do ML dadas pela etiqueta amarela nesta retirada. */
export type RetiradaDetalhe = RetiradaLista & {
  itens: ItemRetiradaVista[];
  evidencias: EvidenciaRetirada[];
  chegadasEtiquetaAmarela: number;
  /** (extra, E29) A marca de apagada (só vem preenchida quando o Gestor pede a apagada com `incluirApagada`). */
  apagadaEm: Date | null;
  apagadaPorNome: string | null;
};

/**
 * (extra, emenda E27) Quantas chegadas de devolução do ML foram dadas pela etiqueta amarela nesta retirada: o evento
 * `recebida` da devolução guarda o código da retirada (`dados.retiradaFull`). Só conta a chegada registrada (o "já
 * chegou" não grava evento).
 */
export async function contarChegadasEtiquetaAmarela(db: DbOuTx, codigoRetirada: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(eventosHistorico)
    .where(
      sql`${eventosHistorico.entidade} = 'devolucao' and ${eventosHistorico.acao} = 'recebida' and ${eventosHistorico.dados}->>'retiradaFull' = ${codigoRetirada}`,
    );
  return total;
}

export async function listarItensRetirada(db: DbOuTx, retiradaId: string): Promise<ItemRetiradaVista[]> {
  const linhas = await db
    .select({
      id: itensRetiradaFull.id,
      produtoId: itensRetiradaFull.produtoId,
      sku: produtos.sku,
      descricaoProduto: produtos.descricao,
      descricao: itensRetiradaFull.descricao,
      eanLido: itensRetiradaFull.eanLido,
      quantidade: itensRetiradaFull.quantidade,
    })
    .from(itensRetiradaFull)
    .leftJoin(produtos, eq(produtos.id, itensRetiradaFull.produtoId))
    .where(eq(itensRetiradaFull.retiradaId, retiradaId))
    .orderBy(asc(itensRetiradaFull.criadoEm), asc(itensRetiradaFull.id));
  return linhas.map((l) => ({
    id: l.id,
    produtoId: l.produtoId,
    sku: l.sku,
    descricao: l.descricaoProduto ?? l.descricao ?? '',
    eanLido: l.eanLido,
    quantidade: l.quantidade,
    semCadastro: l.produtoId === null,
  }));
}

/** (extra, E29) A apagada não é achada; só o Gestor, pela lista Apagadas, pede o detalhe dela com `incluirApagada`. */
export async function obterRetirada(db: DbOuTx, codigo: string, opcoes: { incluirApagada?: boolean } = {}): Promise<RetiradaDetalhe | null> {
  const apagador = alias(usuarios, 'apagador');
  const [r] = await db
    .select({ ...COLUNAS_LISTA, apagadaEm: retiradasFull.apagadaEm, apagadaPorNome: apagador.nome })
    .from(retiradasFull)
    .leftJoin(usuarios, eq(usuarios.id, retiradasFull.recebidaPor))
    .leftJoin(apagador, eq(apagador.id, retiradasFull.apagadaPor))
    .where(and(eq(retiradasFull.codigo, codigo), opcoes.incluirApagada ? undefined : retiradaVisivel));
  if (!r) return null;
  const [itens, fotos, chegadasEtiquetaAmarela] = await Promise.all([
    listarItensRetirada(db, r.id),
    db
      .select({
        id: evidencias.id,
        tipo: evidencias.tipo,
        itemId: evidencias.itemRetiradaId,
        situacao: evidencias.situacaoProcessamento,
        caminho: evidencias.caminho,
        provedor: evidencias.provedor,
        erro: evidencias.erroProcessamento,
      })
      .from(evidencias)
      .where(eq(evidencias.retiradaId, r.id))
      .orderBy(asc(evidencias.enviadoEm)),
    contarChegadasEtiquetaAmarela(db, r.codigo),
  ]);
  return { ...r, itens, evidencias: fotos, chegadasEtiquetaAmarela };
}
