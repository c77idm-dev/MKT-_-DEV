import { isNull, sql, type SQL } from 'drizzle-orm';
import { devolucoes, retiradasFull } from '@/db/schema';

/**
 * (extra, emenda E29) Apagar esconde, não exclui. Toda consulta que lista, conta ou acha uma devolução ou uma retirada
 * usa estes filtros: quadro, etapas, busca, contagens, alertas, recebimento, conferência, planilha Volta ao armazém,
 * contestações, respostas para dar no ML, dossiê e retiradas.
 *
 * Ficam de fora, de propósito:
 * - a sincronização do ML (`mercado-livre/sincronizar.ts`) e a criação pela API (`criarDevolucao` com origem API): elas
 *   continuam achando a linha apagada pela reclamação e pelo `devolucao_externa_id`, não criam outra e não limpam
 *   `apagada_em`;
 * - as tarefas que terminam algo já pedido (NF em processamento, envio da contestação já pedido, processamento de mídia);
 * - o conteúdo físico dos lotes (detalhe do lote, lista consolidada e NF de remessa): o Gestor não apaga a devolução que
 *   tem unidade em lote (`apagarDevolucao`), então nenhum lote tem unidade de devolução apagada.
 */
export const devolucaoVisivel: SQL = isNull(devolucoes.apagadaEm);
export const retiradaVisivel: SQL = isNull(retiradasFull.apagadaEm);

/**
 * O mesmo filtro para SQL escrito à mão, onde a devolução aparece pelo id numa coluna de texto (ex.: `entidade_id` do
 * histórico). Usa o índice da chave primária.
 */
export function devolucaoIdVisivel(colunaId: SQL | { getSQL(): SQL }): SQL {
  return sql`exists (select 1 from "devolucoes" "dv" where "dv"."id"::text = ${colunaId} and "dv"."apagada_em" is null)`;
}
