import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { itensDevolucao, lotes, produtos } from '@/db/schema';
import type { Ator } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { registrarEvento } from '@/modules/historico/eventos';
import { ROTULO_STATUS_LOTE, type StatusLote } from './dominio';
import { type LoteLinha, notaAtivaDoLote } from './repositorio';
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

export type UnidadeBloqueada = { unidade: number; loteCodigo: string; loteStatus: StatusLote };

function juntarComE(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** Spec §8.6: texto da recusa do cancelamento da NF de devolução. */
export function mensagemCancelamentoBloqueado(unidades: UnidadeBloqueada[]): string {
  const codigos: string[] = [];
  const vistos = new Set<string>();
  for (const u of unidades) {
    if (vistos.has(u.loteCodigo)) continue;
    vistos.add(u.loteCodigo);
    codigos.push(`${u.loteCodigo} (${ROTULO_STATUS_LOTE[u.loteStatus]})`);
  }
  const numeros = juntarComE(unidades.map((u) => String(u.unidade)));
  const onde =
    unidades.length === 1
      ? `a unidade ${numeros} está no lote ${codigos[0]}`
      : `as unidades ${numeros} estão ${codigos.length === 1 ? 'no lote' : 'nos lotes'} ${juntarComE(codigos)}`;
  return `Não dá para cancelar esta NF: ${onde}. O cancelamento só é aceito enquanto o lote está Aberto.`;
}

/** Decisão 13: texto do alerta quando a NF é cancelada com a unidade num lote que já passou de Aberto. */
export function mensagemAlertaCancelamento(p: { unidade: number; loteCodigo: string; loteStatus: StatusLote }): string {
  const lote = `${p.loteCodigo} (${ROTULO_STATUS_LOTE[p.loteStatus]})`;
  if (p.loteStatus === 'ENVIADO' || p.loteStatus === 'FINALIZADO') {
    return `A NF de devolução foi cancelada com a unidade ${p.unidade} já enviada ao fornecedor no lote ${lote}. Confira com o contador.`;
  }
  return `A NF de devolução foi cancelada com a unidade ${p.unidade} já no lote ${lote}. A unidade continua no lote: confira com o contador se a NF de Remessa precisa ser cancelada.`;
}

/** Unidades da devolução que estão em lote cujo status não é ABERTO. `travar` pega esses lotes com FOR UPDATE. */
export async function unidadesEmLotesNaoAbertos(tx: DbOuTx, devolucaoId: string, opcoes: { travar?: boolean } = {}): Promise<UnidadeBloqueada[]> {
  const consulta = tx
    .select({ unidade: itensDevolucao.unidade, loteCodigo: lotes.codigo, loteStatus: lotes.status })
    .from(itensDevolucao)
    .innerJoin(lotes, eq(lotes.id, itensDevolucao.loteId))
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), ne(lotes.status, 'ABERTO')))
    .orderBy(asc(itensDevolucao.unidade));
  return opcoes.travar ? consulta.for('update', { of: lotes }) : consulta;
}

/** null = pode cancelar. */
export async function motivoParaNaoCancelarDevolucao(tx: DbOuTx, devolucaoId: string): Promise<string | null> {
  const bloqueadas = await unidadesEmLotesNaoAbertos(tx, devolucaoId);
  return bloqueadas.length === 0 ? null : mensagemCancelamentoBloqueado(bloqueadas);
}

/** Trava TODOS os lotes das unidades da devolução (ordem de id) antes de olhar qualquer status. */
export async function travarLotesDaDevolucao(tx: DbOuTx, devolucaoId: string): Promise<LoteLinha[]> {
  return tx
    .select()
    .from(lotes)
    .where(
      inArray(
        lotes.id,
        tx
          .select({ id: itensDevolucao.loteId })
          .from(itensDevolucao)
          .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), isNotNull(itensDevolucao.loteId))),
      ),
    )
    .orderBy(asc(lotes.id))
    .for('update');
}

/** Spec §8.6: na transação do cancelamento da NF de devolução, tira as unidades dos lotes e da pendência. */
export async function desfazerAlocacao(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void> {
  const travados = await travarLotesDaDevolucao(tx, devolucaoId);
  const porId = new Map<string, { lote: LoteLinha; temNotaAtiva: boolean }>();
  for (const lote of travados) porId.set(lote.id, { lote, temNotaAtiva: (await notaAtivaDoLote(tx, lote.id)) !== null });

  const itens = await tx
    .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade, status: itensDevolucao.status, loteId: itensDevolucao.loteId })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), inArray(itensDevolucao.status, ['EM_LOTE', 'ENVIADO', 'RESOLVIDO', 'SEM_FORNECEDOR'])))
    .orderBy(asc(itensDevolucao.unidade));

  for (const item of itens) {
    if (item.status === 'SEM_FORNECEDOR') {
      exigirTransicaoItem({ de: 'SEM_FORNECEDOR', para: 'AGUARDANDO_NF', ator: 'SISTEMA' });
      await tx.update(itensDevolucao).set({ status: 'AGUARDANDO_NF' }).where(eq(itensDevolucao.id, item.id));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: item.id,
        acao: 'item_status',
        de: 'SEM_FORNECEDOR',
        para: 'AGUARDANDO_NF',
        usuarioId: null,
        em: agora,
        dados: { devolucaoId, motivo: 'NF de devolução cancelada' },
      });
      continue;
    }
    const info = item.loteId ? porId.get(item.loteId) : undefined;
    if (!info) continue;
    const { lote, temNotaAtiva } = info;
    const podeSair = item.status === 'EM_LOTE' && (lote.status === 'ABERTO' || (lote.status === 'FECHADO' && !temNotaAtiva));
    if (podeSair) {
      exigirTransicaoItem({ de: 'EM_LOTE', para: 'AGUARDANDO_NF', ator: 'SISTEMA' });
      await tx.update(itensDevolucao).set({ status: 'AGUARDANDO_NF', loteId: null }).where(eq(itensDevolucao.id, item.id));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: item.id,
        acao: 'item_status',
        de: 'EM_LOTE',
        para: 'AGUARDANDO_NF',
        usuarioId: null,
        em: agora,
        dados: { devolucaoId, loteId: lote.id, loteCodigo: lote.codigo, motivo: 'NF de devolução cancelada' },
      });
      await registrarEvento(tx, {
        entidade: 'lote',
        entidadeId: lote.id,
        acao: 'lote_item_removido',
        usuarioId: null,
        em: agora,
        dados: { itemId: item.id, devolucaoId, unidade: item.unidade, motivo: 'NF de devolução cancelada' },
      });
      continue;
    }
    // A corrida (decisão 13): o lote já andou. Não lança: a NF já foi cancelada na SEFAZ; o alerta vai ao histórico.
    const dados = {
      devolucaoId,
      unidade: item.unidade,
      loteCodigo: lote.codigo,
      loteStatus: lote.status,
      mensagem: mensagemAlertaCancelamento({ unidade: item.unidade, loteCodigo: lote.codigo, loteStatus: lote.status }),
    };
    await registrarEvento(tx, { entidade: 'lote', entidadeId: lote.id, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: agora, dados });
    await registrarEvento(tx, { entidade: 'devolucao', entidadeId: devolucaoId, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: agora, dados });
  }
}
