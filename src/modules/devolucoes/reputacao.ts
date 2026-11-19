import { and, count, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import { ETAPA_DO_STATUS, STATUS_DEVOLUCAO, type StatusDevolucao } from './dominio';

/**
 * (extra) Devolução em andamento = numa das etapas 1 a 4 do quadro (ETAPA_DO_STATUS): Pendente de chegada, Aguardando
 * conferência, Em conferência e Aguardando NF. Ficam de fora as encerradas (Concluída, Cancelada e Extraviada) e a
 * "No CD do marketplace", que também não aparece no quadro. Assim o número do botão do Fluxo é o de cartões do quadro
 * com o selo "Afeta reputação".
 */
export const STATUS_EM_ANDAMENTO: readonly StatusDevolucao[] = STATUS_DEVOLUCAO.filter((s) => ETAPA_DO_STATUS[s] !== undefined);

/**
 * A reclamação do ML mais recente da devolução (a mesma do selo do cartão: DA_ULTIMA_RECLAMACAO em busca.ts) diz que
 * afeta a reputação. Colunas qualificadas à mão, como nas subconsultas da busca; o índice reclamacoes_ml_devolucao_idx atende.
 */
const ULTIMA_RECLAMACAO_AFETA = sql`(select "reclamacoes_ml"."afeta_reputacao" from "reclamacoes_ml" where "reclamacoes_ml"."devolucao_id" = "devolucoes"."id" order by "reclamacoes_ml"."sincronizada_em" desc limit 1) = 'AFETA'`;

/**
 * Condição do filtro "Só as que afetam a reputação no ML (extra)". Sem Status escolhido na Busca, só as em andamento
 * (o mesmo conjunto que o botão do Fluxo conta e abre); com um Status escolhido, vale o Status (ex.: as Concluídas que afetaram).
 */
export function condicaoAfetaReputacao(comStatusEscolhido = false): SQL {
  if (comStatusEscolhido) return ULTIMA_RECLAMACAO_AFETA;
  return and(ULTIMA_RECLAMACAO_AFETA, inArray(devolucoes.status, [...STATUS_EM_ANDAMENTO])) as SQL;
}

/** (extra) O número do botão "Afetam a reputação" do Fluxo, numa consulta só. */
export async function contarAfetamReputacao(db: DbOuTx): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(devolucoes).where(condicaoAfetaReputacao());
  return total;
}
