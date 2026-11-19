import { and, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { ProdutoDoAnuncioML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DbOuTx } from '@/db/client';
import { itensDevolucao, produtos } from '@/db/schema';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { registrarEvento } from '@/modules/historico/eventos';

/**
 * Produtos do ML (extra, emenda E22). O catálogo da produção quase não tem produtos: a sincronização cadastra pelo anúncio
 * o SKU que falta (título, GTIN, foto e id do anúncio; sem fornecedor) e, no produto que já existe, preenche só a foto, o
 * EAN e o id do anúncio que estiverem vazios. Descrição, fornecedor, NCM, custo e unidade são das pessoas: nunca mudam.
 */

/** O limite do SKU no cadastro (interpretarLinhaProduto). */
const MAX_SKU = 60;

export type ResultadoProdutosML = { criados: string[]; completados: string[] };

/** Um anúncio por SKU normalizado (o 1º), em ordem de SKU: duas sincronizações ao mesmo tempo travam os produtos na mesma ordem. */
function porSku(lista: readonly ProdutoDoAnuncioML[]): [string, ProdutoDoAnuncioML][] {
  const mapa = new Map<string, ProdutoDoAnuncioML>();
  for (const p of lista) {
    const sku = normalizarSku(p.sku);
    if (sku && sku.length <= MAX_SKU && !mapa.has(sku)) mapa.set(sku, p);
  }
  return [...mapa].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const vazio = (valor: string | null) => (valor ?? '').trim() === '';

/** O EAN só entra se nenhum OUTRO produto já tiver o mesmo (o leitor da conferência acha o produto pelo EAN). */
async function eanLivre(tx: DbOuTx, ean: string | null, exceto?: string): Promise<boolean> {
  if (!ean) return false;
  const [outro] = await tx
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.ean, ean), exceto ? ne(produtos.id, exceto) : undefined))
    .limit(1);
  return !outro;
}

/** Grava o valor só se a coluna ainda estiver vazia na hora do UPDATE (alguém pode ter salvo o cadastro depois da leitura). */
function seVazio(coluna: AnyPgColumn, valor: string): SQL {
  return sql`case when nullif(btrim(${coluna}), '') is null then ${valor} else ${coluna} end`;
}

/** Chamar na transação da sincronização, antes de criar os itens da devolução (assim eles já nascem ligados ao produto). */
export async function cadastrarProdutosDosAnuncios(
  tx: DbOuTx,
  lista: readonly ProdutoDoAnuncioML[],
  agora: Date,
  origem: { reclamacaoId: string },
): Promise<ResultadoProdutosML> {
  const resultado: ResultadoProdutosML = { criados: [], completados: [] };
  for (const [sku, anuncio] of porSku(lista)) {
    const [atual] = await tx
      .select({ id: produtos.id, ean: produtos.ean, fotoUrl: produtos.fotoUrl, mlItemId: produtos.mlItemId })
      .from(produtos)
      .where(eq(produtos.sku, sku))
      .limit(1);

    if (!atual) {
      // A descrição é obrigatória no cadastro: anúncio sem título não cadastra.
      if (!anuncio.descricao) continue;
      const ean = (await eanLivre(tx, anuncio.ean)) ? anuncio.ean : null;
      const [criado] = await tx
        .insert(produtos)
        .values({ sku, descricao: anuncio.descricao, ean, fotoUrl: anuncio.fotoUrl, mlItemId: anuncio.mlItemId })
        .onConflictDoNothing({ target: produtos.sku })
        .returning({ id: produtos.id });
      // Outra sincronização cadastrou o mesmo SKU no meio: fica o dela.
      if (!criado) continue;
      await registrarEvento(tx, {
        entidade: 'produto',
        entidadeId: criado.id,
        acao: 'ml_produto_criado',
        usuarioId: null,
        em: agora,
        dados: { sku, mlItemId: anuncio.mlItemId, reclamacaoId: origem.reclamacaoId, ean, fotoUrl: anuncio.fotoUrl },
      });
      resultado.criados.push(sku);
      continue;
    }

    const set: Partial<Record<'fotoUrl' | 'mlItemId' | 'ean', SQL>> = {};
    const campos: string[] = [];
    if (vazio(atual.fotoUrl) && anuncio.fotoUrl) {
      set.fotoUrl = seVazio(produtos.fotoUrl, anuncio.fotoUrl);
      campos.push('foto_url');
    }
    if (vazio(atual.mlItemId)) {
      set.mlItemId = seVazio(produtos.mlItemId, anuncio.mlItemId);
      campos.push('ml_item_id');
    }
    if (vazio(atual.ean) && anuncio.ean && (await eanLivre(tx, anuncio.ean, atual.id))) {
      set.ean = seVazio(produtos.ean, anuncio.ean);
      campos.push('ean');
    }
    if (campos.length === 0) continue;
    await tx
      .update(produtos)
      .set({ ...set, atualizadoEm: agora })
      .where(eq(produtos.id, atual.id));
    await registrarEvento(tx, {
      entidade: 'produto',
      entidadeId: atual.id,
      acao: 'ml_produto_completado',
      usuarioId: null,
      em: agora,
      dados: { sku, mlItemId: anuncio.mlItemId, reclamacaoId: origem.reclamacaoId, campos },
    });
    resultado.completados.push(sku);
  }
  return resultado;
}

/**
 * Liga ao produto do mesmo SKU os itens desta devolução que ainda estão sem produto esperado (as devoluções sincronizadas
 * antes dos produtos do ML ganham o vínculo na próxima sincronização). Não troca uma ligação que já existe.
 */
export async function ligarItensSemProduto(tx: DbOuTx, devolucaoId: string): Promise<void> {
  await tx
    .update(itensDevolucao)
    .set({ produtoEsperadoId: produtos.id })
    .from(produtos)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), isNull(itensDevolucao.produtoEsperadoId), eq(itensDevolucao.sku, produtos.sku)));
}
