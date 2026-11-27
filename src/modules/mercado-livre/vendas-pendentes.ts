import { sql, type SQL } from 'drizzle-orm';
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
 * Ritmo, por conta (e não por rodada): cada leitura faz de 6 a 9 chamadas ao ML (reclamação, devolução, pedido, anúncio,
 * envio, reputação, triagem, envio da venda e, às vezes, o motivo). Um lote tem até RECLAMACOES_POR_RODADA = 20
 * leituras por conta, uma a cada 30 s (~10 min, antes da próxima varredura): ~18 chamadas por minuto por conta, ~15% do
 * DEVOLUCOES_RPM do Bitbrain (120/min por empresa), que a varredura e os avisos dividem com este passo. As 463 de hoje
 * levam ~24 lotes (~6 h) numa conta só; com as contas em paralelo, menos.
 * - Ao pedir, o passo grava para cada pedido da devolução uma linha vazia em vendas_ml com `atualizada_em` = o horário
 *   marcado da leitura; a leitura depois a preenche pela regra da D8. Essas linhas são o registro do ritmo da conta.
 * - Uma conta só ganha lote novo quando nenhuma linha dela está vazia com o horário marcado nos últimos ESPERA_LOTE_MS
 *   (ou no futuro): o "Sincronizar agora" (ml.varredura sem chave única, D12) no meio de um lote não pede outro, e uma
 *   fila atrasada até esse tempo também não. O lote novo começa 30 s depois da última leitura marcada (ou feita) da conta.
 * - O limite continua aproximado: o `iniciarEm` é só o horário mais cedo. Com a fila atrasada mais que ESPERA_LOTE_MS,
 *   as leituras vencidas rodam uma atrás da outra; o cliente do ML espera o Retry-After do 429, que vale para todos.
 *
 * Para sozinho: a linha vazia faz o mesmo pedido não voltar no lote seguinte. Quando ela continua vazia (o ML recusou o
 * pedido ou a reclamação, ou a conta ficou indisponível no meio do lote), o pedido volta depois de NOVA_TENTATIVA_MS,
 * uma vez por dia, enquanto a devolução está no Recebimento ou na conferência, onde a ficha é usada. Fechada a
 * devolução, a ficha fica com "Os dados da venda ainda não chegaram do ML.". Quando não sobra nenhum, o passo não faz nada.
 */
export const RECLAMACOES_POR_RODADA = 20;
export const INTERVALO_LEITURAS_MS = 30_000;
/** Uma linha vazia marcada há menos que isto (ou no futuro) é uma leitura que pode estar na fila: a conta espera. */
export const ESPERA_LOTE_MS = 10 * 60_000;
/** A linha que continua vazia é pedida de novo depois disto (só as devoluções no Recebimento ou na conferência). */
export const NOVA_TENTATIVA_MS = 24 * 60 * 60_000;

/** Status em que a devolução espera o pacote: a ficha faz mais falta no Receber pacote, então elas vêm primeiro. */
const ESPERANDO_PACOTE = ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE'] as const;
/** Onde a ficha é usada (Receber pacote, Conferir pacote, Retirada do Full): só elas ganham nova tentativa. */
const NO_FLUXO = [...ESPERANDO_PACOTE, 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA'] as const;

/** A linha de vendas_ml sem nenhum dado da venda (a do passo, antes da leitura ou depois de uma recusa). */
function linhaVazia(v: SQL): SQL {
  return sql`(${v}."vendida_em" is null and ${v}."situacao" is null and ${v}."situacao_envio" is null and jsonb_array_length(${v}."itens") = 0)`;
}

function listaSql(valores: readonly string[]): SQL {
  return sql.join(
    valores.map((c) => sql`${c}`),
    sql`, `,
  );
}

type ReclamacaoSemVenda = { claimId: string; conta: string | null; pedidos: string[] };

/**
 * As reclamações ligadas a devoluções do ML com algum pedido (só número) sem linha em vendas_ml ou, no Recebimento e na
 * conferência, com a linha ainda vazia há mais de NOVA_TENTATIVA_MS; até `porGrupo` por grupo: por conta do Bitbrain
 * (`contas`) ou todas juntas no modo api (`contas` null).
 */
async function reclamacoesSemVenda(db: DbOuTx, contas: string[] | null, porGrupo: number, agora: Date): Promise<ReclamacaoSemVenda[]> {
  const filtroConta = contas === null ? sql`true` : sql`r.conta in (${listaSql(contas)})`;
  const grupo = contas === null ? sql`1` : sql`r.conta`;
  const vencida = new Date(agora.getTime() - NOVA_TENTATIVA_MS).toISOString();
  const linhas = await db.execute<{ claim_id: string; conta: string | null; pedidos: string[] }>(sql`
    select claim_id, conta, pedidos from (
      select r.claim_id, r.conta,
        array(select p from unnest(d.pedidos_externos) p where p ~ '^[0-9]+$') as pedidos,
        row_number() over (
          partition by ${grupo}
          order by (d.status::text in (${listaSql(ESPERANDO_PACOTE)})) desc, d.numero, r.claim_id
        ) as n
      from reclamacoes_ml r
      join devolucoes d on d.id = r.devolucao_id
      where d.canal = 'MERCADO_LIVRE'
        -- (extra, E29) A devolução apagada não pede a venda ao ML.
        and d.apagada_em is null
        and ${filtroConta}
        and exists (
          select 1 from unnest(d.pedidos_externos) p
          where p ~ '^[0-9]+$'
            and (
              not exists (select 1 from vendas_ml v where v.pedido_id = p)
              or (
                d.status::text in (${listaSql(NO_FLUXO)})
                and exists (
                  select 1 from vendas_ml v
                  where v.pedido_id = p and ${linhaVazia(sql`v`)} and v.atualizada_em < ${vencida}::timestamptz
                )
              )
            )
        )
    ) x
    where n <= ${porGrupo}
    order by conta nulls first, n`);
  return linhas.map((l) => ({ claimId: l.claim_id, conta: l.conta, pedidos: l.pedidos }));
}

type RitmoDoGrupo = { ocupado: boolean; ultima: Date };

/**
 * O registro do ritmo, por grupo (a conta no modo bitbrain; '' no modo api, todas juntas), só com as linhas de vendas_ml
 * marcadas nos últimos ESPERA_LOTE_MS (ou no futuro): `ocupado` = alguma delas ainda vazia (leitura do lote anterior
 * que pode estar na fila); `ultima` = a última leitura marcada ou feita.
 */
async function ritmoDosGrupos(db: DbOuTx, bitbrain: boolean, agora: Date): Promise<Map<string, RitmoDoGrupo>> {
  const desde = new Date(agora.getTime() - ESPERA_LOTE_MS).toISOString();
  const grupo = bitbrain ? sql`coalesce(v.conta, '')` : sql`''`;
  const linhas = await db.execute<{ grupo: string; ocupado: boolean; ultima: string | Date }>(sql`
    select ${grupo} as grupo, bool_or(${linhaVazia(sql`v`)}) as ocupado, max(v.atualizada_em) as ultima
    from vendas_ml v
    where v.atualizada_em > ${desde}::timestamptz
    group by 1`);
  return new Map(linhas.map((l) => [l.grupo, { ocupado: l.ocupado, ultima: new Date(l.ultima) }]));
}

/**
 * O passo da ficha da venda para as devoluções antigas (ver o comentário do arquivo). Devolve quantas leituras pediu.
 * No modo bitbrain, só as contas que a varredura lê (marcadas e disponíveis), com o ritmo contado por conta; no modo
 * api, só com a conta do ML ativa, todas juntas.
 */
export async function pedirVendasQueFaltam(db: DbOuTx, fila: Fila, agora: Date): Promise<{ pedidas: number }> {
  const bitbrain = configML().modo === 'bitbrain';
  let contas: string[] | null = null;
  if (bitbrain) {
    contas = (await contasParaVarrer(db)).map((c) => c.empresa);
  } else if ((await obterContaML(db))?.situacao !== 'ATIVA') {
    return { pedidas: 0 };
  }
  const ritmo = await ritmoDosGrupos(db, bitbrain, agora);
  // A conta com uma leitura do lote anterior que pode estar na fila não ganha lote novo nesta rodada.
  if (contas === null) {
    if (ritmo.get('')?.ocupado) return { pedidas: 0 };
  } else {
    contas = contas.filter((c) => !ritmo.get(c)?.ocupado);
    if (contas.length === 0) return { pedidas: 0 };
  }
  const proximaDoGrupo = new Map<string, number>();
  let pedidas = 0;
  for (const r of await reclamacoesSemVenda(db, contas, RECLAMACOES_POR_RODADA, agora)) {
    const grupo = bitbrain ? (r.conta ?? '') : '';
    const ultima = ritmo.get(grupo)?.ultima.getTime();
    const marcada = proximaDoGrupo.get(grupo) ?? Math.max(agora.getTime(), ultima === undefined ? 0 : ultima + INTERVALO_LEITURAS_MS);
    proximaDoGrupo.set(grupo, marcada + INTERVALO_LEITURAS_MS);
    const iniciarEm = new Date(marcada);
    await db.transaction(async (tx) => {
      // A linha guarda o horário marcado (o registro do ritmo). A que já existe e continua vazia (nova tentativa) ganha
      // o horário novo; a que tem dados fica como está.
      await tx
        .insert(vendasMl)
        .values(r.pedidos.map((pedidoId) => ({ pedidoId, conta: r.conta, atualizadaEm: iniciarEm })))
        .onConflictDoUpdate({ target: vendasMl.pedidoId, set: { atualizadaEm: iniciarEm }, setWhere: linhaVazia(sql`${vendasMl}`) });
      await fila.enviar('ml.sincronizar-reclamacao', bitbrain && r.conta ? { claimId: r.claimId, conta: r.conta } : { claimId: r.claimId }, {
        tx,
        // A chave da sincronização na mesma rodada: a varredura que acabou de pedir a mesma reclamação não pede de novo.
        chaveUnica: chaveTarefaReclamacao(r.claimId, agora),
        iniciarEm,
      });
    });
    pedidas += 1;
  }
  return { pedidas };
}
