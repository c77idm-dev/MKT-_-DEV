import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, lotes, notasFiscais, produtos } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { devolucaoVisivel } from '@/modules/apagadas/filtro';
import type { DadosCorrecao } from './correcoes-permitidas';

/**
 * (extra, E29) O que a seção "Corrigir (Gestor)" do detalhe precisa para mostrar só o que o status deixa: a devolução,
 * a NF de devolução ativa (em processamento ou autorizada) e cada unidade com o produto recebido e o lote. A apagada não
 * é achada (ela não tem a seção).
 */
export async function obterDadosCorrecao(db: DbOuTx, devolucaoId: string): Promise<DadosCorrecao | null> {
  if (!ehUuid(devolucaoId)) return null;
  const [d] = await db
    .select({
      status: devolucoes.status,
      naoIdentificada: devolucoes.naoIdentificada,
      origem: devolucoes.origem,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      rastreio: devolucoes.rastreio,
      observacoes: devolucoes.observacoes,
    })
    .from(devolucoes)
    .where(and(eq(devolucoes.id, devolucaoId), devolucaoVisivel))
    .limit(1);
  if (!d) return null;
  const [nota] = await db
    .select({ situacao: notasFiscais.situacao })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.devolucaoId, devolucaoId), inArray(notasFiscais.situacao, ['PROCESSANDO', 'AUTORIZADA'])))
    .limit(1);
  const unidades = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
      produtoRecebidoSku: produtos.sku,
      loteCodigo: lotes.codigo,
      loteStatus: lotes.status,
    })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoRecebidoId))
    .leftJoin(lotes, eq(lotes.id, itensDevolucao.loteId))
    .where(eq(itensDevolucao.devolucaoId, devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
  return { ...d, notaAtiva: nota ? (nota.situacao as 'PROCESSANDO' | 'AUTORIZADA') : null, unidades };
}
