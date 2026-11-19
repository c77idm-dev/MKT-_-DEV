import type { z } from 'zod';
import { AFETA_REPUTACAO_DO_ML, CONDICAO_TRIAGEM_DO_ML, DINHEIRO_DO_ML } from '@/modules/mercado-livre/dominio';
import type { DevolucaoExterna } from '../tipos';
import {
  esquemaAnuncio,
  esquemaDevolucao,
  esquemaEnvio,
  esquemaEnvioVenda,
  esquemaMotivoReclamacao,
  esquemaPedido,
  esquemaReclamacao,
  esquemaReputacao,
  esquemaRevisoes,
  type AnuncioJson,
  type DevolucaoJson,
  type EnvioDevolucaoJson,
  type PedidoJson,
  type ReclamacaoJson,
} from './esquemas';
import { normalizarEan } from '@/modules/catalogo/documentos';
import type { DadosDevolucaoML, ExtrasML, ProdutoDoAnuncioML } from './tipos';

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

function variacaoDoAnuncio(a: AnuncioJson, variacao: string | null) {
  return a.variations.find((v) => v.id !== null && v.id === variacao) ?? null;
}

const ATRIBUTOS_GTIN = new Set(['GTIN', 'EAN']);

/**
 * O 1º GTIN válido (8, 12, 13 ou 14 dígitos com o dígito verificador certo, como no cadastro): primeiro os da variação,
 * depois os do anúncio. O ML aceita mais de um código no mesmo atributo, separados por vírgula.
 */
export function gtinDoAnuncio(a: AnuncioJson, variacao: string | null): string | null {
  const daVariacao = variacaoDoAnuncio(a, variacao)?.attributes ?? [];
  for (const atributo of [...daVariacao, ...a.attributes]) {
    if (!ATRIBUTOS_GTIN.has(atributo.id)) continue;
    for (const parte of (atributo.value_name ?? '').split(/[,;|/]/)) {
      const gtin = normalizarEan(parte);
      if (gtin) return gtin;
    }
  }
  return null;
}

/** Só https (a CSP aceita `img-src https:`); qualquer outra coisa vira null. */
function urlHttps(valor: string | null | undefined): string | null {
  const texto = valor?.trim() ?? '';
  if (!texto || texto.length > 2048) return null;
  try {
    const url = new URL(texto);
    return url.protocol === 'https:' && url.hostname !== '' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** O limite da descrição no cadastro de produtos (interpretarLinhaProduto). */
const MAX_DESCRICAO = 200;

const juntarEspacos = (texto: string | null | undefined) => (texto ?? '').replace(/\s+/g, ' ').trim();

/**
 * Produtos do ML (extra), função pura: o que o anúncio diz do produto.
 * - Descrição: o título; com variação, "<título> — <valores>" (attribute_combinations, ex.: "Camiseta Básica — Azul / M";
 *   decisão do usuário, 19/11). Só serve para CADASTRAR: a descrição de um produto que já existe nunca muda.
 * - Foto: a 1ª da variação (picture_ids[0] em pictures), senão a 1ª do anúncio, senão a miniatura; só https.
 */
export function produtoDoAnuncio(a: AnuncioJson, variacao: string | null): Omit<ProdutoDoAnuncioML, 'sku'> {
  const daVariacao = variacaoDoAnuncio(a, variacao);
  const titulo = juntarEspacos(a.title);
  const valores = (daVariacao?.attribute_combinations ?? []).map((c) => juntarEspacos(c.value_name)).filter((v) => v !== '');
  const descricao = (titulo && valores.length > 0 ? `${titulo} — ${valores.join(' / ')}` : titulo).slice(0, MAX_DESCRICAO).trimEnd();
  const idFotoVariacao = daVariacao?.picture_ids[0] ?? null;
  const fotoVariacao = idFotoVariacao ? a.pictures.find((p) => p.id === idFotoVariacao) : undefined;
  const primeira = a.pictures[0];
  const candidatas = [fotoVariacao?.secure_url, fotoVariacao?.url, primeira?.secure_url, primeira?.url, a.secure_thumbnail, a.thumbnail];
  return {
    mlItemId: a.id,
    descricao: descricao || null,
    ean: gtinDoAnuncio(a, variacao),
    fotoUrl: candidatas.map(urlHttps).find((u) => u !== null) ?? null,
  };
}

/** A linha do pedido do item (a da variação, quando a devolução diz qual; senão a 1ª do item). */
function linhaDoPedido(p: PedidoJson | undefined, itemId: string | null, variacao: string | null) {
  if (!p) return undefined;
  const doItem = p.order_items.filter((l) => l.item.id === itemId);
  return doItem.find((l) => variacao === null || l.item.variation_id === null || l.item.variation_id === variacao) ?? doItem[0];
}

export function skuDoPedido(p: PedidoJson | undefined, itemId: string | null, variacao: string | null): string | null {
  const linha = linhaDoPedido(p, itemId, variacao);
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

const CODIGO = /^[a-z0-9_]+$/;
/** O mesmo limite do "Motivo do cliente" digitado à mão ou vindo da planilha. */
const MAX_MOTIVO = 500;

/**
 * Função pura (suposição A15): o texto do motivo na resposta de GET /post-purchase/v1/claims/reasons/{id}.
 * `detail`, depois `description`, depois `name` se não for um código ("repentant_buyer"). Sem texto: null.
 * Cortado em 500 caracteres.
 */
export function textoMotivoReclamacao(json: unknown): string | null {
  const lido = esquemaMotivoReclamacao.safeParse(json);
  if (!lido.success) return null;
  for (const [valor, podeSerCodigo] of [
    [lido.data.detail, true],
    [lido.data.description, true],
    [lido.data.name, false],
  ] as const) {
    const texto = typeof valor === 'string' ? valor.trim() : '';
    if (texto && (podeSerCodigo || !CODIGO.test(texto))) return texto.slice(0, MAX_MOTIVO).trimEnd();
  }
  return null;
}

export const EXTRAS_VAZIOS: ExtrasML = {
  acaoPendente: null,
  urgente: null,
  afetaReputacao: null,
  ehFull: null,
  triagemCondicao: null,
  triagemEtapa: null,
  dinheiro: null,
};

function porPrazo(a: { due_date: Date | null }, b: { due_date: Date | null }): number {
  return (a.due_date?.getTime() ?? Number.POSITIVE_INFINITY) - (b.due_date?.getTime() ?? Number.POSITIVE_INFINITY);
}

/** D7/A19: a ação obrigatória da loja (urgente) ou, sem ela, a revisão com prazo (não urgente). Sem a loja: nulos. */
function acaoDaLoja(r: ReclamacaoJson): Pick<ExtrasML, 'acaoPendente' | 'urgente'> {
  const loja = r.players.filter((p) => p.role === 'respondent' || p.type === 'seller');
  if (loja.length === 0) return { acaoPendente: null, urgente: null };
  const acoes = loja.flatMap((p) => p.available_actions);
  const obrigatoria = acoes.filter((a) => a.mandatory === true).sort(porPrazo)[0];
  if (obrigatoria) return { acaoPendente: obrigatoria.action, urgente: true };
  const revisao = acoes.filter((a) => ACOES_REVISAO.has(a.action) && a.due_date !== null).sort(porPrazo)[0];
  return { acaoPendente: revisao?.action ?? null, urgente: false };
}

function traduzir<T extends string>(mapa: Record<string, T>, valor: string | null | undefined): T | null {
  return valor && Object.hasOwn(mapa, valor) ? mapa[valor] : null;
}

/** Função pura (§4.5): os 5 extras a partir do que o ML devolveu. Leitura ausente ou fora do formato → nulo. */
export function extrasDaReclamacao(e: {
  reclamacao: ReclamacaoJson;
  devolucao: DevolucaoJson | null;
  reputacao: unknown;
  revisoes: unknown;
  envioVenda: unknown;
}): ExtrasML {
  const reputacao = esquemaReputacao.safeParse(e.reputacao);
  const envio = esquemaEnvioVenda.safeParse(e.envioVenda);
  const tipoLogistico = envio.success ? (envio.data.logistic_type ?? envio.data.logistic?.type ?? null) : null;
  const revisoes = esquemaRevisoes.safeParse(e.revisoes);
  const triagem = (revisoes.success ? revisoes.data.flatMap((r) => r.resource_reviews) : []).filter((x) => x.product_condition !== null).at(-1) ?? null;
  return {
    ...acaoDaLoja(e.reclamacao),
    afetaReputacao: reputacao.success ? traduzir(AFETA_REPUTACAO_DO_ML, reputacao.data.affects_reputation) : null,
    ehFull: tipoLogistico === null ? null : tipoLogistico === 'fulfillment',
    triagemCondicao: traduzir(CONDICAO_TRIAGEM_DO_ML, triagem?.product_condition),
    triagemEtapa: triagem?.stage ?? null,
    dinheiro: e.devolucao ? traduzir(DINHEIRO_DO_ML, e.devolucao.status_money) : null,
  };
}

/** O envio da venda (pedido.shipping.id) do 1º pedido que tiver: é nele que o ML diz se a venda foi Full. */
export function idEnvioDaVenda(pedidos: unknown[]): string | null {
  for (const p of pedidos) {
    const lido = esquemaPedido.safeParse(p);
    const id = lido.success ? (lido.data.shipping?.id ?? null) : null;
    if (id) return id;
  }
  return null;
}

export type EntradaMapeamento = {
  reclamacao: unknown;
  devolucao: unknown | null;
  pedidos: unknown[];
  anuncios: unknown[];
  envio: unknown | null;
  reputacao?: unknown;
  revisoes?: unknown;
  envioVenda?: unknown;
};

/**
 * Função pura: JSON do ML → o que o sistema guarda (spec §7.2). Não faz chamada nem lê o relógio.
 * `statusCanal` = "<return.status>/<status do envio>" (decisão 2 do plano).
 */
export function mapearReclamacao(e: EntradaMapeamento): DadosDevolucaoML {
  const r = analisar(esquemaReclamacao, e.reclamacao, 'reclamação');
  if (e.devolucao === null) {
    return {
      reclamacaoId: r.id,
      statusReclamacao: r.status,
      motivoId: r.reason_id,
      subtipo: null,
      statusDevolucao: null,
      atualizadaEm: r.last_updated ?? r.date_created,
      devolucao: null,
      extras: extrasDaReclamacao({ reclamacao: r, devolucao: null, reputacao: e.reputacao ?? null, revisoes: null, envioVenda: null }),
      produtos: [],
    };
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

  const linhas = d.orders.map((o) => {
    const pedido = pedidosJson.find((p) => p.id === o.order_id);
    return {
      o,
      anuncio: anuncios.find((a) => a.id === o.item_id) ?? null,
      sku: skuDoPedido(pedido, o.item_id, o.variation_id) ?? o.item_id ?? `PEDIDO-${o.order_id}`,
      // A variação vendida: a da devolução ou, sem ela, a do item do pedido (order_items[].item.variation_id).
      variacao: o.variation_id ?? linhaDoPedido(pedido, o.item_id, null)?.item.variation_id ?? null,
    };
  });
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
    itens: linhas.map(({ o, anuncio, sku, variacao }) => ({
      pedido: o.order_id,
      sku,
      ean: anuncio ? gtinDoAnuncio(anuncio, variacao) : null,
      quantidade: quantidadeML(o.return_quantity) ?? quantidadeML(o.total_quantity) ?? 1,
    })),
  };
  const produtos = linhas.flatMap(({ anuncio, sku, variacao }) => (anuncio ? [{ sku, ...produtoDoAnuncio(anuncio, variacao) }] : []));
  const extras = extrasDaReclamacao({
    reclamacao: r,
    devolucao: d,
    reputacao: e.reputacao ?? null,
    revisoes: e.revisoes ?? null,
    envioVenda: e.envioVenda ?? null,
  });
  return {
    reclamacaoId: r.id,
    statusReclamacao: r.status,
    motivoId: r.reason_id,
    subtipo: d.subtype,
    statusDevolucao: d.status,
    atualizadaEm,
    devolucao,
    extras,
    produtos,
  };
}
