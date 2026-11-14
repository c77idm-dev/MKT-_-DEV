import type { DevolucaoExterna, ResultadoConferencia } from '../tipos';
import type { ClienteML } from './cliente';
import { formatarDataML } from './datas';
import { ehRecusaDefinitiva, ErroMotivoIndisponivel, logErroML } from './erros';
import { esquemaArquivoEnviado, esquemaBuscaReclamacoes, esquemaDevolucao, esquemaMotivos, esquemaNotaVenda, esquemaReclamacao } from './esquemas';
import { analisar, ErroFormatoML, escolherEnvio, mapearReclamacao, temDevolucao } from './mapeamento';
import type { ConectorMercadoLivre, DadosDevolucaoML, ReclamacaoAtualizada } from './tipos';

/** Spec §7.2: `limit` no máximo 100 e `offset + limit` abaixo de 10000. */
export const ITENS_POR_PAGINA = 100;
export const LIMITE_OFFSET_BUSCA = 10_000;
const NOVO_FORMATO = { 'x-format-new': 'true' };

export class ErroReclamacaoSemDevolucao extends Error {
  readonly reclamacaoId: string;

  constructor(reclamacaoId: string) {
    super(`A reclamação ${reclamacaoId} do Mercado Livre não tem devolução.`);
    this.name = 'ErroReclamacaoSemDevolucao';
    this.reclamacaoId = reclamacaoId;
  }
}

/** Corpo da revisão com problema (spec §7.4). A chave `reason_id` é a suposição A6. */
export function corpoRevisaoComProblema(r: Extract<ResultadoConferencia, { tipo: 'PROBLEMA' }>, arquivos: string[]): Record<string, unknown> {
  const corpo: Record<string, unknown> = { reason_id: r.motivo, message: r.mensagem, attachments: arquivos };
  if (r.pedido) corpo.order_id = Number.isSafeInteger(Number(r.pedido)) ? Number(r.pedido) : r.pedido;
  return corpo;
}

/**
 * O MarketplaceConnector do Mercado Livre (contrato §5.3). `obter` e `obterReclamacao` recebem o claim_id;
 * `enviarResultadoConferencia` recebe o return_id (decisão 1 do plano).
 */
export class ConectorML implements ConectorMercadoLivre {
  readonly canal = 'MERCADO_LIVRE' as const;
  readonly sellerId: string;
  private readonly cliente: ClienteML;

  constructor(p: { sellerId: string; cliente: ClienteML }) {
    this.sellerId = p.sellerId;
    this.cliente = p.cliente;
  }

  /** Dado de enriquecimento (pedido, anúncio, envio, nota): uma recusa do ML não impede o resto. */
  private async opcional(caminho: string, cabecalhos?: Record<string, string>): Promise<unknown> {
    try {
      return await this.cliente.get(caminho, cabecalhos);
    } catch (erro) {
      if (!ehRecusaDefinitiva(erro)) throw erro;
      logErroML('dado opcional', erro);
      return null;
    }
  }

  async obterReclamacao(reclamacaoId: string): Promise<DadosDevolucaoML> {
    const id = encodeURIComponent(reclamacaoId);
    const reclamacao = await this.cliente.get(`/post-purchase/v1/claims/${id}`);
    const semDevolucao = { reclamacao, devolucao: null, pedidos: [], anuncios: [], envio: null };
    if (!temDevolucao(analisar(esquemaReclamacao, reclamacao, 'reclamação').related_entities)) return mapearReclamacao(semDevolucao);

    const resposta = await this.cliente.get(`/post-purchase/v2/claims/${id}/returns`);
    const devolucao: unknown = Array.isArray(resposta) ? (resposta[0] ?? null) : resposta;
    if (devolucao === null) return mapearReclamacao(semDevolucao);
    const d = analisar(esquemaDevolucao, devolucao, 'devolução');

    const pedidos: unknown[] = [];
    for (const pedido of new Set(d.orders.map((o) => o.order_id))) {
      const p = await this.opcional(`/orders/${encodeURIComponent(pedido)}`);
      if (p !== null) pedidos.push(p);
    }
    const anuncios: unknown[] = [];
    for (const item of new Set(d.orders.flatMap((o) => (o.item_id ? [o.item_id] : [])))) {
      const a = await this.opcional(`/items/${encodeURIComponent(item)}`);
      if (a !== null) anuncios.push(a);
    }
    const envioDevolucao = escolherEnvio(d);
    const envio = envioDevolucao ? await this.opcional(`/shipments/${encodeURIComponent(envioDevolucao.shipment_id)}`, NOVO_FORMATO) : null;
    return mapearReclamacao({ reclamacao, devolucao, pedidos, anuncios, envio });
  }

  async obter(reclamacaoId: string): Promise<DevolucaoExterna> {
    const dados = await this.obterReclamacao(reclamacaoId);
    if (!dados.devolucao) throw new ErroReclamacaoSemDevolucao(reclamacaoId);
    return dados.devolucao;
  }

  async *reclamacoesAtualizadasDesde(desde: Date): AsyncGenerator<ReclamacaoAtualizada> {
    for (let offset = 0; offset + ITENS_POR_PAGINA < LIMITE_OFFSET_BUSCA; offset += ITENS_POR_PAGINA) {
      const consulta = new URLSearchParams({
        'players.user_id': this.sellerId,
        'players.role': 'respondent',
        range: `last_updated:after:${formatarDataML(desde)}`,
        limit: String(ITENS_POR_PAGINA),
        offset: String(offset),
      });
      const pagina = analisar(esquemaBuscaReclamacoes, await this.cliente.get(`/post-purchase/v1/claims/search?${consulta}`), 'busca de reclamações');
      for (const r of pagina.data) {
        // Sem `related_entities` na busca não dá para filtrar: a sincronização decide (reclamação sem devolução é ignorada).
        if (!r.related_entities || temDevolucao(r.related_entities)) yield { reclamacaoId: r.id, atualizadaEm: r.last_updated };
      }
      if (pagina.data.length < ITENS_POR_PAGINA || offset + ITENS_POR_PAGINA >= pagina.paging.total) return;
    }
  }

  async *listarAtualizadasDesde(desde: Date): AsyncGenerator<DevolucaoExterna> {
    for await (const r of this.reclamacoesAtualizadasDesde(desde)) {
      const dados = await this.obterReclamacao(r.reclamacaoId);
      if (dados.devolucao) yield dados.devolucao;
    }
  }

  async enviarResultadoConferencia(devolucaoExternaId: string, r: ResultadoConferencia): Promise<void> {
    const caminho = `/post-purchase/v1/returns/${encodeURIComponent(devolucaoExternaId)}/return-review`;
    if (r.tipo === 'OK') {
      await this.cliente.post(caminho, {});
      return;
    }
    const aceitos = await this.motivosAceitos(r.reclamacaoId);
    if (aceitos && !aceitos.includes(r.motivo)) throw new ErroMotivoIndisponivel(r.motivo, aceitos);
    const arquivos: string[] = [];
    for (const anexo of r.anexos) {
      const resposta = await this.cliente.postArquivo(`/post-purchase/v1/claims/${encodeURIComponent(r.reclamacaoId)}/returns/attachments`, {
        nome: anexo.nome,
        conteudo: anexo.conteudo,
        tipoConteudo: anexo.tipoConteudo,
      });
      arquivos.push(analisar(esquemaArquivoEnviado, resposta, 'anexo enviado').file_name);
    }
    await this.cliente.post(caminho, [corpoRevisaoComProblema(r, arquivos)]);
  }

  /** Motivos oferecidos pelo ML para esta reclamação; null quando a lista não vem no formato esperado (aí o envio decide). */
  private async motivosAceitos(reclamacaoId: string): Promise<string[] | null> {
    const consulta = new URLSearchParams({ flow: 'seller_return_failed', claim_id: reclamacaoId });
    const lido = esquemaMotivos.safeParse(await this.opcional(`/post-purchase/v1/returns/reasons?${consulta}`));
    if (!lido.success) {
      logErroML('motivos de revisão fora do formato', new ErroFormatoML('motivos', lido.error.message));
      return null;
    }
    return lido.data.map((m) => m.id);
  }

  async obterXmlNotaVenda(pedidoExterno: string): Promise<string | null> {
    const pedido = encodeURIComponent(pedidoExterno);
    const nota = (await this.opcional(`/users/${this.sellerId}/invoices/orders/${pedido}`)) ?? (await this.opcional(`/invoices/orders/${pedido}`));
    if (nota === null) return null;
    const lida = esquemaNotaVenda.safeParse(Array.isArray(nota) ? nota[0] : nota);
    if (!lida.success) return null;
    try {
      return await this.cliente.getTexto(`/users/${this.sellerId}/invoices/documents/xml/${encodeURIComponent(lida.data.id)}/authorized`, {
        accept: 'application/xml',
      });
    } catch (erro) {
      if (ehRecusaDefinitiva(erro)) return null;
      throw erro;
    }
  }
}
