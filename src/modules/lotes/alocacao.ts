import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { itensDevolucao, lotes, produtos } from '@/db/schema';
import type { Ator } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { registrarEvento } from '@/modules/historico/eventos';
import { exigirTransicaoLote } from './transicoes-lote';

const TENTATIVAS_LOTE_ABERTO = 3;

/**
 * Lote ABERTO do fornecedor; cria se não houver. O ON CONFLICT usa o índice único parcial `lotes_fornecedor_aberto_uq`.
 * O lote existente é travado (FOR UPDATE) para ninguém fechá-lo entre a leitura e a inclusão da unidade.
 */
export async function obterOuCriarLoteAberto(
  tx: DbOuTx,
  fornecedorId: string,
  agora: Date,
): Promise<{ id: string; codigo: string; criado: boolean }> {
  exigirTransicaoLote({ de: null, para: 'ABERTO', ator: 'SISTEMA' });
  for (let tentativa = 1; tentativa <= TENTATIVAS_LOTE_ABERTO; tentativa += 1) {
    const [novo] = await tx
      .insert(lotes)
      .values({ fornecedorId, criadoEm: agora, atualizadoEm: agora })
      .onConflictDoNothing({ target: lotes.fornecedorId, where: sql`"status" = 'ABERTO'` })
      .returning({ id: lotes.id, codigo: lotes.codigo });
    if (novo) {
      await registrarEvento(tx, {
        entidade: 'lote',
        entidadeId: novo.id,
        acao: 'lote_criado',
        de: null,
        para: 'ABERTO',
        usuarioId: null,
        em: agora,
        dados: { fornecedorId },
      });
      return { ...novo, criado: true };
    }
    const [existente] = await tx
      .select({ id: lotes.id, codigo: lotes.codigo })
      .from(lotes)
      .where(and(eq(lotes.fornecedorId, fornecedorId), eq(lotes.status, 'ABERTO')))
      .for('update');
    if (existente) return { ...existente, criado: false };
  }
  // Erro técnico: a transação volta e a tarefa (nfe.consultar ou lotes.alocar-pendentes) tenta de novo.
  throw new Error(`Não foi possível obter o lote aberto do fornecedor ${fornecedorId} depois de ${TENTATIVAS_LOTE_ABERTO} tentativas.`);
}

export type PedidoInclusao = {
  itemId: string;
  unidade: number;
  devolucaoId: string;
  de: 'AGUARDANDO_NF' | 'SEM_FORNECEDOR';
  fornecedorId: string;
  ator: Ator;
  usuarioId: string | null;
  agora: Date;
};

/** Põe a unidade no lote ABERTO do fornecedor (criando-o se preciso) e registra os eventos da unidade e do lote. */
export async function incluirNoLote(tx: DbOuTx, p: PedidoInclusao): Promise<{ loteId: string; loteCodigo: string }> {
  exigirTransicaoItem({ de: p.de, para: 'EM_LOTE', ator: p.ator });
  const lote = await obterOuCriarLoteAberto(tx, p.fornecedorId, p.agora);
  await tx.update(itensDevolucao).set({ status: 'EM_LOTE', loteId: lote.id }).where(eq(itensDevolucao.id, p.itemId));
  await registrarEvento(tx, {
    entidade: 'item',
    entidadeId: p.itemId,
    acao: 'item_status',
    de: p.de,
    para: 'EM_LOTE',
    usuarioId: p.usuarioId,
    em: p.agora,
    dados: { loteId: lote.id, loteCodigo: lote.codigo, devolucaoId: p.devolucaoId },
  });
  await registrarEvento(tx, {
    entidade: 'lote',
    entidadeId: lote.id,
    acao: 'lote_item_incluido',
    usuarioId: p.usuarioId,
    em: p.agora,
    dados: { itemId: p.itemId, devolucaoId: p.devolucaoId, unidade: p.unidade },
  });
  return { loteId: lote.id, loteCodigo: lote.codigo };
}

/** Spec §5.3: na autorização da NF de devolução, cada unidade PROBLEMA vai para o lote do fornecedor do produto recebido. */
export async function alocarItensProblema(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<{ alocadas: number; semFornecedor: number }> {
  const pendentes = await tx
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
      fornecedorId: produtos.fornecedorId,
    })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoRecebidoId))
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'AGUARDANDO_NF'), eq(itensDevolucao.destino, 'PROBLEMA')))
    .orderBy(asc(itensDevolucao.unidade));

  let alocadas = 0;
  let semFornecedor = 0;
  for (const item of pendentes) {
    if (item.fornecedorId) {
      await incluirNoLote(tx, {
        itemId: item.id,
        unidade: item.unidade,
        devolucaoId,
        de: 'AGUARDANDO_NF',
        fornecedorId: item.fornecedorId,
        ator: 'SISTEMA',
        usuarioId: null,
        agora,
      });
      alocadas += 1;
      continue;
    }
    exigirTransicaoItem({ de: 'AGUARDANDO_NF', para: 'SEM_FORNECEDOR', ator: 'SISTEMA' });
    await tx.update(itensDevolucao).set({ status: 'SEM_FORNECEDOR' }).where(eq(itensDevolucao.id, item.id));
    await registrarEvento(tx, {
      entidade: 'item',
      entidadeId: item.id,
      acao: 'item_status',
      de: 'AGUARDANDO_NF',
      para: 'SEM_FORNECEDOR',
      usuarioId: null,
      em: agora,
      dados: {
        motivo: item.produtoRecebidoId ? 'Produto recebido sem fornecedor no cadastro' : 'Produto recebido desconhecido',
      },
    });
    semFornecedor += 1;
  }
  return { alocadas, semFornecedor };
}
