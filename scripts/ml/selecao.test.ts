import { describe, expect, it } from 'vitest';
import { idsDaDevolucao, reclamacoesComDevolucao } from './selecao';

describe('reclamacoesComDevolucao', () => {
  it('fica só com reclamações que têm devolução, aceitando "return" e "returns", até o máximo', () => {
    const r = [
      { id: 1, related_entities: ['return'] },
      { id: 2, related_entities: [] },
      { id: 3, related_entities: ['returns'] },
      { id: 4 },
      { id: 5, related_entities: ['changes', 'return'] },
    ];
    expect(reclamacoesComDevolucao(r, 2).map((x) => x.id)).toEqual([1, 3]);
  });
});

describe('idsDaDevolucao', () => {
  it('extrai os IDs de pedidos e de envios como texto, ignorando vazios', () => {
    expect(
      idsDaDevolucao({
        orders: [{ order_id: 2000001 }, {}, { order_id: '2000002' }],
        shipments: [{ shipment_id: 4400 }],
      }),
    ).toEqual({ pedidos: ['2000001', '2000002'], envios: ['4400'] });
  });

  it('lida com devolução sem pedidos nem envios', () => {
    expect(idsDaDevolucao({})).toEqual({ pedidos: [], envios: [] });
  });
});
