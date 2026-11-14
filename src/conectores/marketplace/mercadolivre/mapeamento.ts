import type { z } from 'zod';
import type { DevolucaoExterna } from '../tipos';
import {
  esquemaAnuncio,
  esquemaDevolucao,
  esquemaEnvio,
  esquemaPedido,
  esquemaReclamacao,
  type AnuncioJson,
  type DevolucaoJson,
  type EnvioDevolucaoJson,
  type PedidoJson,
  type ReclamacaoJson,
} from './esquemas';
import type { DadosDevolucaoML } from './tipos';

export class ErroFormatoML extends Error {
  constructor(oQue: string, detalhes: string) {
    super(`Resposta do Mercado Livre fora do formato esperado (${oQue}): ${detalhes}`);
    this.name = 'ErroFormatoML';
  }
}

export function analisar<S extends z.ZodType>(esquema: S, valor: unknown, oQue: string): z.output<S> {
  const lido = esquema.safeParse(valor);
  if (!lido.success) {
    throw new ErroFormatoML(oQue, lido.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; '));
  }
  return lido.data;
}

/** Ações do vendedor que trazem o prazo para revisar a devolução (spec §7.4). */
const ACOES_REVISAO = new Set(['return_review', 'return_review_ok', 'return_review_fail']);

/** Spec §7.6, ponto 5: o ML escreve "return" ou "returns". */
export function temDevolucao(entidades: readonly string[]): boolean {
  return entidades.some((e) => e === 'return' || e === 'returns');
}

export function prazoDaReclamacao(r: ReclamacaoJson): Date | null {
  const prazos = r.players
    .filter((p) => p.role === 'respondent' || p.type === 'seller')
    .flatMap((p) => p.available_actions)
    .filter((a) => ACOES_REVISAO.has(a.action))
    .flatMap((a) => (a.due_date ? [a.due_date.getTime()] : []));
  return prazos.length === 0 ? null : new Date(Math.min(...prazos));
}

/** O reenvio da triagem (return_from_triage) é o envio que importa quando existe; senão, o último envio da lista. */
export function escolherEnvio(d: DevolucaoJson): EnvioDevolucaoJson | null {
  return d.shipments.find((s) => s.type === 'return_from_triage') ?? d.shipments.at(-1) ?? null;
}

export function gtinDoAnuncio(a: AnuncioJson, variacao: string | null): string | null {
  const daVariacao = a.variations.find((v) => v.id !== null && v.id === variacao)?.attributes ?? [];
  const valor = [...daVariacao, ...a.attributes].find((x) => x.id === 'GTIN')?.value_name ?? '';
  const digitos = valor.replace(/\D/g, '');
  return [8, 12, 13, 14].includes(digitos.length) ? digitos : null;
}

export function skuDoPedido(p: PedidoJson | undefined, itemId: string | null, variacao: string | null): string | null {
  if (!p) return null;
  const doItem = p.order_items.filter((l) => l.item.id === itemId);
  const linha = doItem.find((l) => variacao === null || l.item.variation_id === null || l.item.variation_id === variacao) ?? doItem[0];
  const sku = (linha?.item.seller_sku || linha?.item.seller_custom_field || '').trim();
  return sku || null;
}

/** Spec §7.6, ponto 5: as quantidades vêm em texto ("1.0"). */
export function quantidadeML(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Suposição A1: a troca aparece como `type: "change"` na reclamação ou na devolução. */
function ehTroca(r: ReclamacaoJson, d: DevolucaoJson): boolean {
  return r.type === 'change' || d.type === 'change' || r.related_entities.includes('change');
}

export type EntradaMapeamento = {
  reclamacao: unknown;
  devolucao: unknown | null;
  pedidos: unknown[];
  anuncios: unknown[];
  envio: unknown | null;
};

/**
 * Função pura: JSON do ML → o que o sistema guarda (spec §7.2). Não faz chamada nem lê o relógio.
 * `statusCanal` = "<return.status>/<status do envio>" (decisão 2 do plano).
 */
export function mapearReclamacao(e: EntradaMapeamento): DadosDevolucaoML {
  const r = analisar(esquemaReclamacao, e.reclamacao, 'reclamação');
  if (e.devolucao === null) {
    return { reclamacaoId: r.id, statusReclamacao: r.status, subtipo: null, statusDevolucao: null, atualizadaEm: r.last_updated ?? r.date_created, devolucao: null };
  }
  const d = analisar(esquemaDevolucao, e.devolucao, 'devolução');
  const pedidosJson = e.pedidos.map((p) => analisar(esquemaPedido, p, 'pedido'));
  const anuncios = e.anuncios.map((a) => analisar(esquemaAnuncio, a, 'anúncio'));
  const envio = e.envio === null ? null : analisar(esquemaEnvio, e.envio, 'envio');

  const envioDevolucao = escolherEnvio(d);
  const statusEnvio = envio?.status ?? envioDevolucao?.status ?? null;
  const nomeDestino = envioDevolucao?.destination?.name ?? null;
  const destinoEnvio = nomeDestino === 'warehouse' ? 'CD_MARKETPLACE' : nomeDestino === 'seller_address' ? 'VENDEDOR' : null;
  const entregueEm = destinoEnvio === 'VENDEDOR' && statusEnvio === 'delivered' ? (envio?.status_history?.date_delivered ?? d.last_updated) : null;
  const atualizadaEm = d.last_updated ?? r.last_updated ?? d.date_created ?? r.date_created;
  if (!atualizadaEm) throw new ErroFormatoML('devolução', 'sem last_updated nem date_created');

  const pedidos = [...new Set(d.orders.map((o) => o.order_id))];
  if (pedidos.length === 0 && r.resource_id) pedidos.push(r.resource_id);

  const devolucao: DevolucaoExterna = {
    canal: 'MERCADO_LIVRE',
    devolucaoExternaId: d.id,
    reclamacaoId: r.id,
    tipo: ehTroca(r, d) ? 'TROCA' : 'DEVOLUCAO',
    semEnvioFisico: d.subtype === 'low_cost',
    pedidos,
    statusCanal: statusEnvio ? `${d.status}/${statusEnvio}` : d.status,
    destinoEnvio,
    reenvioDaTriagem: envioDevolucao?.type === 'return_from_triage',
    rastreio: envio?.tracking_number ?? envioDevolucao?.tracking_number ?? null,
    transportadora: envio?.tracking_method ?? null,
    entregueEm,
    prazoConferencia: prazoDaReclamacao(r),
    atualizadaEm,
    itens: d.orders.map((o) => {
      const anuncio = anuncios.find((a) => a.id === o.item_id);
      return {
        pedido: o.order_id,
        sku: skuDoPedido(pedidosJson.find((p) => p.id === o.order_id), o.item_id, o.variation_id) ?? o.item_id ?? `PEDIDO-${o.order_id}`,
        ean: anuncio ? gtinDoAnuncio(anuncio, o.variation_id) : null,
        quantidade: quantidadeML(o.return_quantity) ?? quantidadeML(o.total_quantity) ?? 1,
      };
    }),
  };
  return { reclamacaoId: r.id, statusReclamacao: r.status, subtipo: d.subtype, statusDevolucao: d.status, atualizadaEm, devolucao };
}
