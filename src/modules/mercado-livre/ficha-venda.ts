import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ItemVendaML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, devolucoes, itensDevolucao, motivosReclamacaoMl, produtos, reclamacoesMl, vendasMl } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { normalizarSku } from '@/modules/catalogo/documentos';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { totalDaVenda, urlVendaML } from './venda';

/**
 * Ficha da venda (extra, emenda E27): o básico da venda do ML de uma devolução que já está no sistema. Os dados são
 * todos serializáveis (datas em ISO), para a ficha ir do servidor a um componente de cliente ou ao estado de uma ação.
 * O valor aparece para todos que veem a devolução (decisão do usuário).
 */

/** Um item da venda, com a foto do cadastro de produtos pelo SKU (E22); sem produto ou sem foto, null. */
export type ItemFichaVenda = ItemVendaML & { fotoUrl: string | null };

export type VendaDaFicha = {
  pedidoId: string;
  /** false = os dados da venda ainda não chegaram do ML (sem linha em vendas_ml, ou só a linha vazia do passo das antigas). */
  temDados: boolean;
  /** ISO 8601. */
  vendidaEm: string | null;
  /** Códigos do ML; o texto em pt-BR vem de rotuloSituacaoVenda. */
  situacao: string | null;
  situacaoEnvio: string | null;
  itens: ItemFichaVenda[];
  /** Soma de quantidade × valor; null sem itens ou com um item sem valor. */
  total: number | null;
  /** "Abrir a venda no ML"; null quando o pedido não é um número do ML. */
  urlNoML: string | null;
};

/** O que a devolução espera receber (os itens somados por SKU), para a lista de devoluções do mesmo pedido. */
export type ProdutoDaDevolucao = { sku: string; descricao: string | null; fotoUrl: string | null; quantidade: number };

export type FichaVenda = {
  devolucaoId: string;
  codigo: string;
  status: StatusDevolucao;
  /** Nome da conta do Bitbrain (ou a empresa); null no modo api. */
  conta: string | null;
  /** Texto do motivo da reclamação (ou o código, sem o texto no cache); null sem reclamação gravada. */
  motivo: string | null;
  /** Código do ML (opened, closed); o texto vem de rotuloSituacaoReclamacao. */
  situacaoReclamacao: string | null;
  /**
   * (24/11) false = nenhuma reclamação do ML ligada à devolução no sistema (sem linha em reclamacoes_ml; o número
   * digitado à mão não conta), como a criada à mão: a venda só é lida pela reclamação, então nunca vai chegar.
   */
  temReclamacao: boolean;
  /** Uma por pedido da devolução, na ordem dela. */
  vendas: VendaDaFicha[];
  produtos: ProdutoDaDevolucao[];
};

function temDados(v: { vendidaEm: Date | null; situacao: string | null; situacaoEnvio: string | null; itens: ItemVendaML[] }): boolean {
  return v.vendidaEm !== null || v.situacao !== null || v.situacaoEnvio !== null || v.itens.length > 0;
}

/**
 * As fichas das devoluções do ML entre `ids`, na ordem dos ids (as de outro canal, as que não existem e os ids que não
 * são uuid ficam de fora). Para a parte B: a lista das devoluções achadas pelo número do pedido.
 */
export async function fichasDasDevolucoes(db: DbOuTx, ids: readonly string[]): Promise<FichaVenda[]> {
  const validos = [...new Set(ids.filter(ehUuid))];
  if (validos.length === 0) return [];
  const linhas = await db
    .select({ id: devolucoes.id, codigo: devolucoes.codigo, status: devolucoes.status, pedidos: devolucoes.pedidosExternos })
    .from(devolucoes)
    .where(and(inArray(devolucoes.id, validos), eq(devolucoes.canal, 'MERCADO_LIVRE')));
  if (linhas.length === 0) return [];
  const idsML = linhas.map((d) => d.id);

  // A reclamação mais recente de cada devolução (como a seção "Mercado Livre" do detalhe).
  const reclamacoes = await db
    .selectDistinctOn([reclamacoesMl.devolucaoId], {
      devolucaoId: reclamacoesMl.devolucaoId,
      conta: sql<string | null>`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})`,
      motivo: sql<string | null>`coalesce(${motivosReclamacaoMl.nome}, ${reclamacoesMl.motivoId})`,
      situacao: reclamacoesMl.statusReclamacao,
    })
    .from(reclamacoesMl)
    .leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))
    .leftJoin(motivosReclamacaoMl, eq(motivosReclamacaoMl.id, reclamacoesMl.motivoId))
    .where(inArray(reclamacoesMl.devolucaoId, idsML))
    .orderBy(reclamacoesMl.devolucaoId, desc(reclamacoesMl.sincronizadaEm));
  const reclamacaoDa = new Map(reclamacoes.map((r) => [r.devolucaoId, r]));

  const pedidos = [...new Set(linhas.flatMap((d) => d.pedidos))];
  const vendas = pedidos.length === 0 ? [] : await db.select().from(vendasMl).where(inArray(vendasMl.pedidoId, pedidos));
  const vendaDo = new Map(vendas.map((v) => [v.pedidoId, v]));

  const itens = await db
    .select({ devolucaoId: itensDevolucao.devolucaoId, sku: itensDevolucao.sku, descricao: produtos.descricao, fotoUrl: produtos.fotoUrl })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
    .where(inArray(itensDevolucao.devolucaoId, idsML))
    .orderBy(asc(itensDevolucao.unidade));

  // Fotos dos itens vendidos pelo SKU do cadastro (normalizado como no cadastro).
  const skus = [...new Set(vendas.flatMap((v) => v.itens.flatMap((i) => (i.sku ? [normalizarSku(i.sku)] : []))))];
  const fotos = skus.length === 0 ? [] : await db.select({ sku: produtos.sku, fotoUrl: produtos.fotoUrl }).from(produtos).where(inArray(produtos.sku, skus));
  const fotoDo = new Map(fotos.map((f) => [f.sku, f.fotoUrl]));

  const porId = new Map(
    linhas.map((d): [string, FichaVenda] => {
      const r = reclamacaoDa.get(d.id);
      const contaDaVenda = d.pedidos.map((p) => vendaDo.get(p)?.conta ?? null).find((c) => c !== null) ?? null;
      const produtosDaDevolucao = new Map<string, ProdutoDaDevolucao>();
      for (const i of itens.filter((x) => x.devolucaoId === d.id)) {
        const atual = produtosDaDevolucao.get(i.sku);
        if (atual) atual.quantidade += 1;
        else produtosDaDevolucao.set(i.sku, { sku: i.sku, descricao: i.descricao, fotoUrl: i.fotoUrl, quantidade: 1 });
      }
      return [
        d.id,
        {
          devolucaoId: d.id,
          codigo: d.codigo,
          status: d.status,
          conta: r?.conta ?? contaDaVenda,
          motivo: r?.motivo ?? null,
          situacaoReclamacao: r?.situacao ?? null,
          temReclamacao: r !== undefined,
          vendas: d.pedidos.map((pedidoId): VendaDaFicha => {
            const v = vendaDo.get(pedidoId);
            const itensDaVenda = (v?.itens ?? []).map((i): ItemFichaVenda => ({ ...i, fotoUrl: i.sku ? (fotoDo.get(normalizarSku(i.sku)) ?? null) : null }));
            return {
              pedidoId,
              temDados: v ? temDados(v) : false,
              vendidaEm: v?.vendidaEm?.toISOString() ?? null,
              situacao: v?.situacao ?? null,
              situacaoEnvio: v?.situacaoEnvio ?? null,
              itens: itensDaVenda,
              total: totalDaVenda(itensDaVenda),
              urlNoML: urlVendaML(pedidoId),
            };
          }),
          produtos: [...produtosDaDevolucao.values()],
        },
      ];
    }),
  );
  return validos.flatMap((id) => {
    const f = porId.get(id);
    return f ? [f] : [];
  });
}

/** A ficha da venda de uma devolução do ML; null quando não é do ML, não existe ou o id não é uuid. */
export async function fichaDaDevolucao(db: DbOuTx, devolucaoId: string): Promise<FichaVenda | null> {
  return (await fichasDasDevolucoes(db, [devolucaoId]))[0] ?? null;
}
