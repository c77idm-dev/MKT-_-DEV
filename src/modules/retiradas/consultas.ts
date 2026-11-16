import { asc, count, desc, eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { evidencias, itensRetiradaFull, produtos, retiradasFull, usuarios } from '@/db/schema';
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

/** Lista "Retiradas do Full": a mais nova primeiro. */
export async function listarRetiradas(
  db: DbOuTx,
  opcoes: { pagina: number; porPagina?: number },
): Promise<{ retiradas: RetiradaLista[]; total: number }> {
  const porPagina = opcoes.porPagina ?? POR_PAGINA_RETIRADAS;
  const pagina = Math.max(1, opcoes.pagina);
  const [{ total }] = await db.select({ total: count() }).from(retiradasFull);
  const retiradas = await db
    .select(COLUNAS_LISTA)
    .from(retiradasFull)
    .leftJoin(usuarios, eq(usuarios.id, retiradasFull.recebidaPor))
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

export type RetiradaDetalhe = RetiradaLista & { itens: ItemRetiradaVista[]; evidencias: EvidenciaRetirada[] };

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

export async function obterRetirada(db: DbOuTx, codigo: string): Promise<RetiradaDetalhe | null> {
  const [r] = await db
    .select(COLUNAS_LISTA)
    .from(retiradasFull)
    .leftJoin(usuarios, eq(usuarios.id, retiradasFull.recebidaPor))
    .where(eq(retiradasFull.codigo, codigo));
  if (!r) return null;
  const [itens, fotos] = await Promise.all([
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
  ]);
  return { ...r, itens, evidencias: fotos };
}
