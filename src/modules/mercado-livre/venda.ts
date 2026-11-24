/**
 * Ficha da venda (extra, emenda E27): rótulos em pt-BR, total e o link da venda no ML. Funções puras, sem banco: o
 * componente da ficha (src/components/venda/FichaVenda.tsx) as usa no servidor e no navegador.
 */

/** `order.status` do ML. */
const ROTULO_SITUACAO_PEDIDO: Record<string, string> = {
  confirmed: 'Confirmada',
  payment_required: 'Aguardando pagamento',
  payment_in_process: 'Pagamento em análise',
  partially_paid: 'Paga em parte',
  paid: 'Paga',
  partially_refunded: 'Reembolsada em parte',
  pending_cancel: 'Cancelamento em andamento',
  cancelled: 'Cancelada',
  invalid: 'Inválida',
};

/** `shipment.status` do envio da venda. */
const ROTULO_SITUACAO_ENVIO: Record<string, string> = {
  pending: 'Envio pendente',
  handling: 'Em preparação',
  ready_to_ship: 'Pronta para envio',
  shipped: 'A caminho',
  delivered: 'Entregue',
  not_delivered: 'Não entregue',
  cancelled: 'Envio cancelado',
  to_be_agreed: 'Envio a combinar',
  closed: 'Envio encerrado',
};

/** `claim.status` do ML. */
const ROTULO_SITUACAO_RECLAMACAO: Record<string, string> = { opened: 'Aberta', closed: 'Encerrada' };

function rotulo(mapa: Record<string, string>, codigo: string | null): string | null {
  if (!codigo) return null;
  return Object.hasOwn(mapa, codigo) ? mapa[codigo] : codigo;
}

/** "Paga · Entregue". Um código que o sistema não conhece aparece como veio; sem os dois, null. */
export function rotuloSituacaoVenda(situacao: string | null, situacaoEnvio: string | null): string | null {
  const partes = [rotulo(ROTULO_SITUACAO_PEDIDO, situacao), rotulo(ROTULO_SITUACAO_ENVIO, situacaoEnvio)].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** "Aberta" ou "Encerrada"; código desconhecido aparece como veio. */
export function rotuloSituacaoReclamacao(status: string | null): string | null {
  return rotulo(ROTULO_SITUACAO_RECLAMACAO, status);
}

/**
 * Soma de quantidade × valor unitário (a rota do Bitbrain não manda `total_amount`), em centavos para não errar no
 * ponto flutuante. Sem itens, ou com um item sem quantidade ou sem valor: null (nunca um total pela metade).
 */
export function totalDaVenda(itens: readonly { quantidade: number | null; valorUnitario: number | null }[]): number | null {
  if (itens.length === 0) return null;
  let centavos = 0;
  for (const i of itens) {
    if (i.quantidade === null || i.valorUnitario === null) return null;
    centavos += Math.round(i.valorUnitario * 100) * i.quantidade;
  }
  return centavos / 100;
}

/**
 * "Abrir a venda no ML": o detalhe da venda no painel do vendedor, pelo número do pedido. O "Responda no ML" só cita
 * o número da venda (não tinha link). Só número inteiro: o pedido digitado à mão pode ter outra coisa.
 */
export function urlVendaML(pedidoId: string): string | null {
  return /^\d+$/.test(pedidoId) ? `https://www.mercadolivre.com.br/vendas/${pedidoId}/detalhe` : null;
}
