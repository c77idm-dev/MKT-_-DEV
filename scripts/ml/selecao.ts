export type ReclamacaoResumo = { id: number | string; related_entities?: string[]; type?: string };

export function reclamacoesComDevolucao(reclamacoes: ReclamacaoResumo[], max: number): ReclamacaoResumo[] {
  return reclamacoes
    .filter((r) => (r.related_entities ?? []).some((e) => e === 'return' || e === 'returns'))
    .slice(0, max);
}

export type DevolucaoML = {
  id?: number | string;
  orders?: { order_id?: number | string }[];
  shipments?: { shipment_id?: number | string }[];
};

function paraTexto(valores: (number | string | undefined)[]): string[] {
  return valores.filter((v): v is number | string => v !== undefined && v !== null && v !== '').map(String);
}

export function idsDaDevolucao(d: DevolucaoML): { pedidos: string[]; envios: string[] } {
  return {
    pedidos: paraTexto((d.orders ?? []).map((o) => o.order_id)),
    envios: paraTexto((d.shipments ?? []).map((s) => s.shipment_id)),
  };
}
