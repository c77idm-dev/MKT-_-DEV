import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { itensDevolucao, produtos } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { ErroConferencia } from './erros';
import { compararEan, validarItem, type EntradaItem } from './regras';
import { exigirConferente } from './trava';

/** Durante a conferência a unidade continua PENDENTE: destino, motivo e campos podem ser gravados e trocados (contrato §4.6). */
export async function salvarItem(db: Db, devolucaoId: string, itemId: string, entrada: EntradaItem, usuario: UsuarioSessao): Promise<void> {
  const { colunas, erros } = validarItem(entrada);
  if (!colunas) throw new ErroConferencia(erros.join('; '));
  await db.transaction(async (tx) => {
    await exigirConferente(tx, devolucaoId, usuario);
    const [gravado] = await tx
      .update(itensDevolucao)
      .set(colunas)
      .where(and(eq(itensDevolucao.id, itemId), eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'PENDENTE')))
      .returning({ id: itensDevolucao.id });
    if (!gravado) throw new ErroConferencia('Unidade não encontrada nesta devolução.');
  });
}

export type ResultadoEan = {
  situacao: 'confere' | 'diverge' | 'sem_referencia' | 'confirmado';
  produtoRecebido: { sku: string; descricao: string } | null;
  sugerirMotivo: 'DIVERGENTE' | null;
};

async function resumoProduto(tx: DbOuTx, id: string | null): Promise<{ sku: string; descricao: string } | null> {
  if (!id) return null;
  const [p] = await tx.select({ sku: produtos.sku, descricao: produtos.descricao }).from(produtos).where(eq(produtos.id, id));
  return p ?? null;
}

/**
 * Leitura do código de barras da unidade (spec §6.3). `lido = null`: "não dá para ler, o produto é o esperado".
 * O código lido é guardado como veio (sem espaços, em maiúsculas) para a Busca Avançada.
 */
export async function registrarEan(
  db: Db,
  devolucaoId: string,
  itemId: string,
  lidoBruto: string | null,
  usuario: UsuarioSessao,
): Promise<ResultadoEan> {
  const lido = lidoBruto === null ? null : lidoBruto.replace(/\s+/g, '').toUpperCase();
  if (lido !== null && (lido.length === 0 || lido.length > 50)) {
    throw new ErroConferencia('Leia ou digite o código de barras (até 50 caracteres).');
  }
  return db.transaction(async (tx) => {
    await exigirConferente(tx, devolucaoId, usuario);
    const [item] = await tx
      .select({ esperadoId: itensDevolucao.produtoEsperadoId, eanEsperado: produtos.ean })
      .from(itensDevolucao)
      .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
      .where(and(eq(itensDevolucao.id, itemId), eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'PENDENTE')));
    if (!item) throw new ErroConferencia('Unidade não encontrada nesta devolução.');

    if (lido === null) {
      await tx.update(itensDevolucao).set({ eanLido: null, produtoRecebidoId: item.esperadoId }).where(eq(itensDevolucao.id, itemId));
      return { situacao: 'confirmado', produtoRecebido: await resumoProduto(tx, item.esperadoId), sugerirMotivo: null };
    }

    // Pelo EAN sem zeros à esquerda; se o esperado estiver entre os achados, ele vence.
    const achados = /^\d+$/.test(lido)
      ? await tx
          .select({ id: produtos.id })
          .from(produtos)
          .where(sql`ltrim(${produtos.ean}, '0') = ltrim(${lido}, '0')`)
          .limit(5)
      : [];
    const achado = achados.find((a) => a.id === item.esperadoId) ?? achados[0] ?? null;
    const esperado = item.esperadoId ? { id: item.esperadoId, ean: item.eanEsperado } : null;
    const c = compararEan({ esperado, lido, achado });
    await tx.update(itensDevolucao).set({ eanLido: lido, produtoRecebidoId: c.produtoRecebidoId }).where(eq(itensDevolucao.id, itemId));
    return { situacao: c.situacao, produtoRecebido: await resumoProduto(tx, c.produtoRecebidoId), sugerirMotivo: c.sugerirMotivo };
  });
}

/** Só para a conclusão: as unidades da devolução, na ordem. */
export async function unidadesDaDevolucao(tx: DbOuTx, devolucaoId: string, ids?: string[]) {
  return tx
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      eanLido: itensDevolucao.eanLido,
      produtoEsperadoId: itensDevolucao.produtoEsperadoId,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
    })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), ids ? inArray(itensDevolucao.id, ids) : undefined))
    .orderBy(itensDevolucao.unidade);
}
