import { and, asc, count, desc, eq, notInArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, itensRetiradaFull, produtos, retiradasFull } from '@/db/schema';
import { SITUACAO_RETIRADA, situacaoDaUnidade, type LinhaVolta, type Periodo } from './dominio';

/** O dia inteiro de "de" até o fim de "ate", no horário de Brasília (igual à Busca Avançada). */
function noPeriodo(coluna: AnyColumn, p: Periodo): SQL {
  return sql`${coluna} >= (${p.de}::date::timestamp at time zone 'America/Sao_Paulo') and ${coluna} < ((${p.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`;
}

/**
 * Unidades de devolução com destino BOM cuja conferência foi concluída (devolucoes.conferida_em) no período, em qualquer
 * status depois dela (AUSENTE e PENDENTE ficam de fora; PROBLEMA não tem destino BOM).
 */
function unidadesBom(p: Periodo): SQL | undefined {
  return and(eq(itensDevolucao.destino, 'BOM'), notInArray(itensDevolucao.status, ['PENDENTE', 'AUSENTE']), noPeriodo(devolucoes.conferidaEm, p));
}

/** Itens das retiradas do Full Conferidas (retiradas_full.concluida_em) no período. */
function retiradasConferidas(p: Periodo): SQL | undefined {
  return and(eq(retiradasFull.situacao, 'CONFERIDA'), noPeriodo(retiradasFull.concluidaEm, p));
}

export type OpcoesLista = {
  /** 'asc' (padrão, a planilha) ou 'desc' (os cartões: os mais recentes primeiro). */
  ordem?: 'asc' | 'desc';
  /** Sem limite, traz tudo (a planilha). */
  limite?: number;
};

/** Melhoria 4: o que voltou ao armazém no período (unidades BOM e itens das retiradas conferidas), em ordem de data. */
export async function listarVoltaAoArmazem(db: DbOuTx, p: Periodo, opcoes: OpcoesLista = {}): Promise<LinhaVolta[]> {
  const ordem = opcoes.ordem === 'desc' ? desc : asc;
  const recebido = alias(produtos, 'produto_recebido');
  const esperado = alias(produtos, 'produto_esperado');
  // (extra) EAN lido que não está no cadastro (sem produto recebido): a unidade não é mostrada como o produto da venda.
  const eanForaDoCadastro = sql`(${itensDevolucao.eanLido} is not null and ${itensDevolucao.produtoRecebidoId} is null)`;
  const consultaUnidades = db
    .select({
      id: itensDevolucao.id,
      data: devolucoes.conferidaEm,
      origem: devolucoes.codigo,
      status: itensDevolucao.status,
      // O SKU da venda só vale sem produto recebido (como na lista consolidada).
      sku: sql<string>`case when ${eanForaDoCadastro} then '' else coalesce(${recebido.sku}, ${itensDevolucao.sku}) end`,
      descricao: sql<string>`case when ${eanForaDoCadastro} then 'Sem cadastro (EAN lido: ' || ${itensDevolucao.eanLido} || ')'
        else coalesce(${recebido.descricao}, ${esperado.descricao}, '') end`,
      ean: sql<string | null>`coalesce(${itensDevolucao.eanLido}, ${recebido.ean}, ${esperado.ean})`,
      serial: itensDevolucao.serial,
    })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .leftJoin(recebido, eq(recebido.id, itensDevolucao.produtoRecebidoId))
    .leftJoin(esperado, eq(esperado.id, itensDevolucao.produtoEsperadoId))
    .where(unidadesBom(p))
    .orderBy(ordem(devolucoes.conferidaEm), ordem(devolucoes.numero), asc(itensDevolucao.unidade))
    .$dynamic();
  const consultaItens = db
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
    .where(retiradasConferidas(p))
    .orderBy(ordem(retiradasFull.concluidaEm), ordem(retiradasFull.numero), asc(itensRetiradaFull.criadoEm), asc(itensRetiradaFull.id))
    .$dynamic();
  // Com limite, cada fonte traz no máximo o limite; depois de juntar, corta de novo.
  const [unidades, itens] = await Promise.all(
    opcoes.limite === undefined
      ? [consultaUnidades, consultaItens]
      : ([consultaUnidades.limit(opcoes.limite), consultaItens.limit(opcoes.limite)] as const),
  );

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
  const sinal = opcoes.ordem === 'desc' ? -1 : 1;
  // Ordenação estável: dentro da mesma data, a ordem de cada consulta (unidade, item) se mantém.
  linhas.sort((a, b) => sinal * (a.data.getTime() - b.data.getTime()));
  return opcoes.limite === undefined ? linhas : linhas.slice(0, opcoes.limite);
}

/** Totais do período sem trazer as linhas: quantas linhas a planilha terá e a soma das quantidades. */
export async function resumirVoltaAoArmazem(db: DbOuTx, p: Periodo): Promise<{ linhas: number; unidades: number }> {
  const [[u], [r]] = await Promise.all([
    db
      .select({ linhas: count() })
      .from(itensDevolucao)
      .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
      .where(unidadesBom(p)),
    db
      .select({ linhas: count(), unidades: sql<number>`coalesce(sum(${itensRetiradaFull.quantidade}), 0)::int` })
      .from(itensRetiradaFull)
      .innerJoin(retiradasFull, eq(retiradasFull.id, itensRetiradaFull.retiradaId))
      .where(retiradasConferidas(p)),
  ]);
  return { linhas: u.linhas + r.linhas, unidades: u.linhas + r.unidades };
}
