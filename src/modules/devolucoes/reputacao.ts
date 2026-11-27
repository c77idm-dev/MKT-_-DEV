import { and, count, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import { devolucaoVisivel } from '@/modules/apagadas/filtro';
import { STATUS_DEVOLUCAO, type StatusDevolucao } from './dominio';

const ENCERRADAS: readonly StatusDevolucao[] = ['CONCLUIDA', 'CANCELADA', 'EXTRAVIADA'];

/**
 * (extra) Todo status que não é de encerramento: etapas 1 a 4 do quadro e a No CD do marketplace (CD do ML / Full, também
 * pesa na reputação; decisão do usuário 19/11). A No CD não tem coluna no quadro: o N pode passar dos selos à vista, mas
 * é sempre o total da Busca com o filtro.
 */
export const STATUS_EM_ANDAMENTO: readonly StatusDevolucao[] = STATUS_DEVOLUCAO.filter((s) => !ENCERRADAS.includes(s));

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
  const [{ total }] = await db.select({ total: count() }).from(devolucoes).where(and(condicaoAfetaReputacao(), devolucaoVisivel));
  return total;
}
