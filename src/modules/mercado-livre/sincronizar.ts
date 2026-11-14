import { and, asc, eq, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { ErroFormatoML } from '@/conectores/marketplace/mercadolivre/mapeamento';
import type { DadosDevolucaoML } from '@/conectores/marketplace/mercadolivre/tipos';
import type { DevolucaoExterna } from '@/conectores/marketplace/tipos';
import type { DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, reclamacoesMl } from '@/db/schema';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { criarDevolucao, type DadosCanal, type DadosNovaDevolucao } from '@/modules/devolucoes/criar';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import type { Fila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { rotuloStatusML } from './dominio';
import { ANTES_DA_CHEGADA, encerradaNoML, proximoStatusML } from './status';

const ENCERRADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];
/** Depois da conferência o resultado (OK ou contestação) já devia ter ido ao ML (decisão 11 do plano). */
const DEPOIS_DA_CONFERENCIA: StatusDevolucao[] = ['AGUARDANDO_NF', 'CONCLUIDA'];

export type ResultadoAplicacao =
  | { acao: 'sem_devolucao' }
  | { acao: 'so_consulta'; motivo: 'low_cost' | 'encerrada_no_ml' }
  | { acao: 'criada' | 'vinculada' | 'atualizada'; devolucaoId: string; codigo: string; status: StatusDevolucao };

type Atual = {
  id: string;
  codigo: string;
  reclamacaoId: string | null;
  status: StatusDevolucao;
  statusCanal: string | null;
  rastreio: string | null;
  transportadora: string | null;
  entregueSegundoCanalEm: Date | null;
  pedidosExternos: string[];
};

const COLUNAS = {
  id: devolucoes.id,
  codigo: devolucoes.codigo,
  reclamacaoId: devolucoes.reclamacaoId,
  status: devolucoes.status,
  statusCanal: devolucoes.statusCanal,
  rastreio: devolucoes.rastreio,
  transportadora: devolucoes.transportadora,
  entregueSegundoCanalEm: devolucoes.entregueSegundoCanalEm,
  pedidosExternos: devolucoes.pedidosExternos,
};

function rastreioDe(d: DevolucaoExterna): string | null {
  return d.rastreio ? normalizarRastreio(d.rastreio) || null : null;
}

function unir(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Contrato §5.5: canal MERCADO_LIVRE, pedido = pedidos[0], itens pelo seller_sku (somados por SKU). */
export function dadosNovaDevolucao(d: DevolucaoExterna): DadosNovaDevolucao {
  const pedido = d.pedidos[0];
  if (!pedido) throw new ErroFormatoML('devolução', 'sem número de pedido');
  const porSku = new Map<string, number>();
  for (const item of d.itens) {
    const sku = normalizarSku(item.sku);
    porSku.set(sku, (porSku.get(sku) ?? 0) + item.quantidade);
  }
  return {
    canal: 'MERCADO_LIVRE',
    pedido,
    reclamacaoId: d.reclamacaoId,
    rastreio: rastreioDe(d),
    transportadora: d.transportadora,
    motivoCliente: null,
    postadaEm: null,
    itens: [...porSku].map(([sku, quantidade]) => ({ sku, quantidade })),
  };
}

export function dadosCanal(d: DevolucaoExterna): DadosCanal {
  return {
    devolucaoExternaId: d.devolucaoExternaId,
    tipo: d.tipo,
    pedidos: d.pedidos,
    statusCanal: d.statusCanal,
    entregueSegundoCanalEm: d.entregueEm,
    prazoConferenciaCanal: d.prazoConferencia,
  };
}

async function evento(
  tx: DbOuTx,
  devolucaoId: string,
  acao: string,
  agora: Date,
  extra: { de?: string | null; para?: string | null; dados?: Record<string, unknown> } = {},
): Promise<void> {
  await registrarEvento(tx, { entidade: 'devolucao', entidadeId: devolucaoId, acao, usuarioId: null, em: agora, ...extra });
}

async function gravarReclamacao(tx: DbOuTx, dados: DadosDevolucaoML, devolucaoId: string | null, agora: Date): Promise<void> {
  const valores = {
    returnId: dados.devolucao?.devolucaoExternaId ?? null,
    subtipo: dados.subtipo,
    statusReclamacao: dados.statusReclamacao,
    statusDevolucao: dados.statusDevolucao,
    devolucaoId,
    atualizadaNoMlEm: dados.atualizadaEm,
    sincronizadaEm: agora,
  };
  await tx.insert(reclamacoesMl).values({ claimId: dados.reclamacaoId, ...valores }).onConflictDoUpdate({ target: reclamacoesMl.claimId, set: valores });
}

async function atualizar(tx: DbOuTx, atual: Atual, d: DevolucaoExterna, agora: Date): Promise<void> {
  const antesDaChegada = ANTES_DA_CHEGADA.includes(atual.status);
  const rastreio = rastreioDe(d);
  await tx
    .update(devolucoes)
    .set({
      statusCanal: d.statusCanal,
      prazoConferenciaCanal: d.prazoConferencia,
      tipo: d.tipo,
      pedidosExternos: unir(atual.pedidosExternos, d.pedidos),
      entregueSegundoCanalEm: atual.entregueSegundoCanalEm ?? d.entregueEm,
      // Antes da chegada o rastreio acompanha o ML (o reenvio da triagem traz um rastreio novo); depois, vale o lido na recepção.
      ...(antesDaChegada && rastreio ? { rastreio, transportadora: d.transportadora ?? atual.transportadora } : {}),
      atualizadaEm: agora,
    })
    .where(eq(devolucoes.id, atual.id));
  // O due_date do ML costuma aparecer só depois da entrega: a contestação ainda aberta acompanha o prazo da devolução.
  if (d.prazoConferencia !== null) {
    await tx
      .update(contestacoesCanal)
      .set({ prazo: d.prazoConferencia, atualizadaEm: agora })
      .where(and(eq(contestacoesCanal.devolucaoId, atual.id), ne(contestacoesCanal.status, 'ENVIADA')));
  }
  if (atual.statusCanal !== d.statusCanal) {
    await evento(tx, atual.id, antesDaChegada ? 'ml_status_atualizado' : 'ml_status_apos_chegada', agora, {
      dados: { statusCanalAnterior: atual.statusCanal, statusCanal: d.statusCanal },
    });
  }
  if (!atual.entregueSegundoCanalEm && d.entregueEm) await evento(tx, atual.id, 'ml_entregue', agora, { dados: { entregueEm: d.entregueEm.toISOString() } });
}

/** D9: devolução manual (ou de planilha) ativa do mesmo pedido no ML, ainda sem id externo. */
async function manualDoPedido(tx: DbOuTx, pedidos: string[]): Promise<Atual | null> {
  if (pedidos.length === 0) return null;
  const [d] = await tx
    .select(COLUNAS)
    .from(devolucoes)
    .where(
      and(
        eq(devolucoes.canal, 'MERCADO_LIVRE'),
        isNull(devolucoes.devolucaoExternaId),
        ne(devolucoes.origem, 'API'),
        notInArray(devolucoes.status, ENCERRADAS),
        sql`${devolucoes.pedidosExternos} && ARRAY[${sql.join(
          pedidos.map((p) => sql`${p}`),
          sql`, `,
        )}]::text[]`,
      ),
    )
    .orderBy(asc(devolucoes.numero))
    .limit(1);
  return d ?? null;
}

async function vincular(tx: DbOuTx, manual: Atual, d: DevolucaoExterna, agora: Date): Promise<boolean> {
  const [vinculada] = await tx
    .update(devolucoes)
    .set({
      devolucaoExternaId: d.devolucaoExternaId,
      // O ML é a fonte: o texto digitado à mão não pode apontar os anexos e os motivos para outra reclamação.
      reclamacaoId: d.reclamacaoId,
      tipo: d.tipo,
      statusCanal: d.statusCanal,
      prazoConferenciaCanal: d.prazoConferencia,
      entregueSegundoCanalEm: manual.entregueSegundoCanalEm ?? d.entregueEm,
      rastreio: manual.rastreio ?? rastreioDe(d),
      transportadora: manual.transportadora ?? d.transportadora,
      pedidosExternos: unir(manual.pedidosExternos, d.pedidos),
      atualizadaEm: agora,
    })
    .where(and(eq(devolucoes.id, manual.id), isNull(devolucoes.devolucaoExternaId)))
    .returning({ id: devolucoes.id });
  if (!vinculada) return false;
  await evento(tx, manual.id, 'ml_vinculada', agora, {
    dados: {
      devolucaoExternaId: d.devolucaoExternaId,
      reclamacaoId: d.reclamacaoId,
      ...(manual.reclamacaoId && manual.reclamacaoId !== d.reclamacaoId ? { reclamacaoIdManual: manual.reclamacaoId } : {}),
    },
  });
  if (!manual.entregueSegundoCanalEm && d.entregueEm) await evento(tx, manual.id, 'ml_entregue', agora, { dados: { entregueEm: d.entregueEm.toISOString() } });
  return true;
}

async function aplicarStatus(tx: DbOuTx, alvo: Atual, d: DevolucaoExterna, agora: Date): Promise<StatusDevolucao> {
  const para = proximoStatusML(alvo.status, d);
  if (!para) return alvo.status;
  exigirTransicao({ de: alvo.status, para, ator: 'SISTEMA' });
  const [mudou] = await tx
    .update(devolucoes)
    .set({ status: para, atualizadaEm: agora })
    .where(and(eq(devolucoes.id, alvo.id), eq(devolucoes.status, alvo.status)))
    .returning({ id: devolucoes.id });
  // Outra ação mudou o status no meio (ex.: a recepção leu o rastreio): vale a dela.
  if (!mudou) return alvo.status;
  const encerrada = para === 'CANCELADA' || para === 'EXTRAVIADA';
  const acao = para === 'NO_CD_MARKETPLACE' ? 'ml_no_cd' : para === 'PENDENTE_CHEGADA' ? 'ml_reenviada_ao_vendedor' : para === 'CANCELADA' ? 'cancelada' : 'extraviada';
  await evento(tx, alvo.id, acao, agora, {
    de: alvo.status,
    para,
    dados: encerrada ? { motivo: `Status no Mercado Livre: ${rotuloStatusML(d.statusCanal)}` } : { statusCanal: d.statusCanal },
  });
  return para;
}

/**
 * Aplica no sistema o que o ML mostra de uma reclamação (contrato §5.5). Numa transação com trava por reclamação
 * (espaço 3 das travas do sistema: o 1 é do rastreio e o 2 da gestão de usuários).
 */
export async function aplicarReclamacao(db: DbOuTx, dados: DadosDevolucaoML, agora: Date, fila?: Fila): Promise<ResultadoAplicacao> {
  return db.transaction(async (tx): Promise<ResultadoAplicacao> => {
    await tx.execute(sql`select pg_advisory_xact_lock(3, hashtext(${`reclamacao:${dados.reclamacaoId}`}))`);
    const d = dados.devolucao;
    if (!d) {
      await gravarReclamacao(tx, dados, null, agora);
      return { acao: 'sem_devolucao' };
    }
    const [existente] = await tx
      .select(COLUNAS)
      .from(devolucoes)
      .where(and(eq(devolucoes.canal, 'MERCADO_LIVRE'), eq(devolucoes.devolucaoExternaId, d.devolucaoExternaId)))
      .limit(1);
    let acao: 'criada' | 'vinculada' | 'atualizada';
    let alvoId: string;
    if (existente) {
      await atualizar(tx, existente, d, agora);
      acao = 'atualizada';
      alvoId = existente.id;
    } else {
      const manual = d.semEnvioFisico ? null : await manualDoPedido(tx, d.pedidos);
      if (manual && (await vincular(tx, manual, d, agora))) {
        acao = 'vinculada';
        alvoId = manual.id;
      } else if (d.semEnvioFisico || encerradaNoML(d)) {
        await gravarReclamacao(tx, dados, null, agora);
        return { acao: 'so_consulta', motivo: d.semEnvioFisico ? 'low_cost' : 'encerrada_no_ml' };
      } else {
        const criada = await criarDevolucao(tx, dadosNovaDevolucao(d), { origem: 'API', usuario: null, canal: dadosCanal(d), agora });
        if (d.entregueEm) await evento(tx, criada.id, 'ml_entregue', agora, { dados: { entregueEm: d.entregueEm.toISOString() } });
        acao = 'criada';
        alvoId = criada.id;
      }
    }
    const [alvo] = await tx.select(COLUNAS).from(devolucoes).where(eq(devolucoes.id, alvoId));
    const status = await aplicarStatus(tx, alvo, d, agora);
    await gravarReclamacao(tx, dados, alvo.id, agora);
    if (acao === 'vinculada' && fila && DEPOIS_DA_CONFERENCIA.includes(status)) {
      // Chave diferente da do fim da conferência (`devolucaoId`), que já foi usada e ficou só com o evento "sem vínculo"
      // (contrato §10, E4). O vínculo acontece uma vez por devolução.
      await fila.enviar('ml.enviar-resultado', { devolucaoId: alvo.id }, { tx, chaveUnica: `${alvo.id}:vinculo` });
    }
    return { acao, devolucaoId: alvo.id, codigo: alvo.codigo, status };
  });
}
