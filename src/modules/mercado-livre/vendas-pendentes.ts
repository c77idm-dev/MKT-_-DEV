import { sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { vendasMl } from '@/db/schema';
import type { Fila } from '@/modules/fila/fila';
import { configML } from './config';
import { obterContaML } from './contas';
import { contasParaVarrer } from './contas-bitbrain';
import { chaveTarefaReclamacao } from './notificacoes';

/**
 * Ficha da venda (extra, emenda E27): as devoluções que já existiam antes da ficha (~463 na VPS em 24/11). A cada
 * varredura (ml.varredura, a cada 15 min), este passo pede de novo, aos poucos, a leitura das reclamações ligadas a
 * devoluções do ML cujo pedido ainda não tem linha em vendas_ml. Usa a mesma tarefa da sincronização
 * (ml.sincronizar-reclamacao), que grava a venda na mesma transação.
 *
 * Ritmo: cada leitura faz de 6 a 9 chamadas ao ML (reclamação, devolução, pedido, anúncio, envio, reputação, triagem,
 * envio da venda e, às vezes, o motivo). Com RECLAMACOES_POR_RODADA = 20 por conta e uma leitura a cada 30 s, a rodada
 * leva ~10 min (antes da próxima varredura) e fica em no máximo ~18 chamadas por minuto por conta: ~15% do
 * DEVOLUCOES_RPM do Bitbrain (120/min por empresa), que a varredura e os avisos dividem com este passo; o 429 é o mesmo
 * para todos e o cliente já espera o Retry-After. As 463 de hoje levam ~24 rodadas (~6 h) numa conta só; com as contas
 * em paralelo, menos.
 *
 * Para sozinho: ao pedir, o passo grava uma linha vazia em vendas_ml para cada pedido da devolução (a leitura depois a
 * preenche pela regra da D8). Assim o mesmo pedido não volta a ser pedido, mesmo quando o ML recusa o pedido ou a
 * reclamação; quando não sobra nenhum, o passo não faz nada. A ficha mostra a linha vazia como "Os dados da venda ainda
 * não chegaram do ML.", e a sincronização normal a completa quando a reclamação mudar.
 */
export const RECLAMACOES_POR_RODADA = 20;
export const INTERVALO_LEITURAS_MS = 30_000;

/** Status em que a devolução espera o pacote: a ficha faz mais falta no Receber pacote, então elas vêm primeiro. */
const ESPERANDO_PACOTE = ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'] as const;

type ReclamacaoSemVenda = { claimId: string; conta: string | null; pedidos: string[] };

/**
 * As reclamações ligadas a devoluções do ML com algum pedido (só número) sem linha em vendas_ml, até `porGrupo` por
 * grupo: por conta do Bitbrain (`contas`) ou todas juntas no modo api (`contas` null).
 */
async function reclamacoesSemVenda(db: DbOuTx, contas: string[] | null, porGrupo: number): Promise<ReclamacaoSemVenda[]> {
  const filtroConta =
    contas === null
      ? sql`true`
      : sql`r.conta in (${sql.join(
          contas.map((c) => sql`${c}`),
          sql`, `,
        )})`;
  const grupo = contas === null ? sql`1` : sql`r.conta`;
  const esperando = sql.join(
    ESPERANDO_PACOTE.map((s) => sql`${s}`),
    sql`, `,
  );
  const linhas = await db.execute<{ claim_id: string; conta: string | null; pedidos: string[] }>(sql`
    select claim_id, conta, pedidos from (
      select r.claim_id, r.conta,
        array(select p from unnest(d.pedidos_externos) p where p ~ '^[0-9]+$') as pedidos,
        row_number() over (
          partition by ${grupo}
          order by (d.status::text in (${esperando})) desc, d.numero, r.claim_id
        ) as n
      from reclamacoes_ml r
      join devolucoes d on d.id = r.devolucao_id
      where d.canal = 'MERCADO_LIVRE'
        and ${filtroConta}
        and exists (
          select 1 from unnest(d.pedidos_externos) p
          where p ~ '^[0-9]+$' and not exists (select 1 from vendas_ml v where v.pedido_id = p)
        )
    ) x
    where n <= ${porGrupo}
    order by conta nulls first, n`);
  return linhas.map((l) => ({ claimId: l.claim_id, conta: l.conta, pedidos: l.pedidos }));
}

/**
 * O passo da ficha da venda para as devoluções antigas (ver o comentário do arquivo). Devolve quantas leituras pediu.
 * No modo bitbrain, só as contas que a varredura lê (marcadas e disponíveis), com o espaçamento contado por conta; no
 * modo api, só com a conta do ML ativa, todas juntas.
 */
export async function pedirVendasQueFaltam(db: DbOuTx, fila: Fila, agora: Date): Promise<{ pedidas: number }> {
  const bitbrain = configML().modo === 'bitbrain';
  let contas: string[] | null = null;
  if (bitbrain) {
    contas = (await contasParaVarrer(db)).map((c) => c.empresa);
    if (contas.length === 0) return { pedidas: 0 };
  } else if ((await obterContaML(db))?.situacao !== 'ATIVA') {
    return { pedidas: 0 };
  }
  const posicaoNoGrupo = new Map<string, number>();
  let pedidas = 0;
  for (const r of await reclamacoesSemVenda(db, contas, RECLAMACOES_POR_RODADA)) {
    const grupo = bitbrain ? (r.conta ?? '') : '';
    const posicao = posicaoNoGrupo.get(grupo) ?? 0;
    posicaoNoGrupo.set(grupo, posicao + 1);
    await db.transaction(async (tx) => {
      await tx
        .insert(vendasMl)
        .values(r.pedidos.map((pedidoId) => ({ pedidoId, conta: r.conta, atualizadaEm: agora })))
        .onConflictDoNothing({ target: vendasMl.pedidoId });
      await fila.enviar('ml.sincronizar-reclamacao', bitbrain && r.conta ? { claimId: r.claimId, conta: r.conta } : { claimId: r.claimId }, {
        tx,
        chaveUnica: chaveTarefaReclamacao(r.claimId, agora),
        iniciarEm: new Date(agora.getTime() + posicao * INTERVALO_LEITURAS_MS),
      });
    });
    pedidas += 1;
  }
  return { pedidas };
}
