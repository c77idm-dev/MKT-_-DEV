import { and, asc, eq, notInArray, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, itensRetiradaFull, produtos, retiradasFull } from '@/db/schema';
import { SITUACAO_RETIRADA, situacaoDaUnidade, type LinhaVolta, type Periodo } from './dominio';

/** O dia inteiro de "de" até o fim de "ate", no horário de Brasília (igual à Busca Avançada). */
function noPeriodo(coluna: AnyColumn, p: Periodo): SQL {
  return sql`${coluna} >= (${p.de}::date::timestamp at time zone 'America/Sao_Paulo') and ${coluna} < ((${p.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
}

/**
 * Melhoria 4: o que voltou ao armazém no período, em ordem de data.
 * - Unidades de devolução com destino BOM cuja conferência foi concluída (devolucoes.conferida_em) no período, em qualquer
 *   status depois dela (AUSENTE e PENDENTE ficam de fora; PROBLEMA não tem destino BOM).
 * - Itens das retiradas do Full Conferidas (retiradas_full.concluida_em) no período.
 */
export async function listarVoltaAoArmazem(db: DbOuTx, p: Periodo): Promise<LinhaVolta[]> {
  const recebido = alias(produtos, 'produto_recebido');
  const esperado = alias(produtos, 'produto_esperado');
  const [unidades, itens] = await Promise.all([
    db
      .select({
        id: itensDevolucao.id,
        data: devolucoes.conferidaEm,
        origem: devolucoes.codigo,
        unidade: itensDevolucao.unidade,
        status: itensDevolucao.status,
        // O SKU da venda só vale sem produto recebido (como na lista consolidada).
        sku: sql<string>`coalesce(${recebido.sku}, ${itensDevolucao.sku})`,
        descricao: sql<string>`coalesce(${recebido.descricao}, ${esperado.descricao}, '')`,
        ean: sql<string | null>`coalesce(${itensDevolucao.eanLido}, ${recebido.ean}, ${esperado.ean})`,
        serial: itensDevolucao.serial,
      })
      .from(itensDevolucao)
      .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
      .leftJoin(recebido, eq(recebido.id, itensDevolucao.produtoRecebidoId))
      .leftJoin(esperado, eq(esperado.id, itensDevolucao.produtoEsperadoId))
      .where(
        and(
          eq(itensDevolucao.destino, 'BOM'),
          notInArray(itensDevolucao.status, ['PENDENTE', 'AUSENTE']),
          noPeriodo(devolucoes.conferidaEm, p),
        ),
      )
      .orderBy(asc(devolucoes.conferidaEm), asc(devolucoes.numero), asc(itensDevolucao.unidade)),
    db
      .select({
        id: itensRetiradaFull.id,
        data: retiradasFull.concluidaEm,
        origem: retiradasFull.codigo,
        sku: sql<string>`coalesce(${produtos.sku}, '')`,
        descricao: sql<string>`coalesce(${produtos.descricao}, ${itensRetiradaFull.descricao}, '')`,
        ean: sql<string | null>`coalesce(${itensRetiradaFull.eanLido}, ${produtos.ean})`,
        quantidade: itensRetiradaFull.quantidade,
      })
      .from(itensRetiradaFull)
      .innerJoin(retiradasFull, eq(retiradasFull.id, itensRetiradaFull.retiradaId))
      .leftJoin(produtos, eq(produtos.id, itensRetiradaFull.produtoId))
      .where(and(eq(retiradasFull.situacao, 'CONFERIDA'), noPeriodo(retiradasFull.concluidaEm, p)))
      .orderBy(asc(retiradasFull.concluidaEm), asc(retiradasFull.numero), asc(itensRetiradaFull.criadoEm), asc(itensRetiradaFull.id)),
  ]);

  const linhas: LinhaVolta[] = [
    ...unidades.map(
      (u): LinhaVolta => ({
        chave: u.id,
        tipo: 'DEVOLUCAO',
        data: u.data!,
        origem: u.origem,
        sku: u.sku,
        descricao: u.descricao,
        ean: u.ean,
        quantidade: 1,
        situacao: situacaoDaUnidade(u.status),
        serial: u.serial,
      }),
    ),
    ...itens.map(
      (i): LinhaVolta => ({
        chave: i.id,
        tipo: 'RETIRADA',
        data: i.data!,
        origem: i.origem,
        sku: i.sku,
        descricao: i.descricao,
        ean: i.ean,
        quantidade: i.quantidade,
        situacao: SITUACAO_RETIRADA,
        serial: null,
      }),
    ),
  ];
  // Ordenação estável: dentro da mesma data, a ordem de cada consulta (unidade, item) se mantém.
  return linhas.sort((a, b) => a.data.getTime() - b.data.getTime());
}
