import { describe, expect, it } from 'vitest';
import { MARCA_REDIGIDO } from '@/lib/redigir';
import { idsDaDevolucao, reclamacoesComDevolucao, resumirCorpoErro } from './selecao';

describe('resumirCorpoErro', () => {
  it('redige dados pessoais de um corpo JSON e mantém os demais campos', () => {
    const resumo = resumirCorpoErro(JSON.stringify({ message: 'not_found', buyer: { first_name: 'Ana' } }));
    const obtido = JSON.parse(resumo);
    expect(obtido.buyer.first_name).toBe(MARCA_REDIGIDO);
    expect(obtido.message).toBe('not_found');
  });

  it('omite um corpo que não é JSON, sem repetir o conteúdo', () => {
    const resumo = resumirCorpoErro('<html>erro Ana Souza</html>');
    expect(resumo).toBe('[corpo não-JSON omitido: 27 caracteres]');
    expect(resumo).not.toContain('Ana');
  });

  it('corta o resumo em no máximo 300 caracteres', () => {
    const corpo = JSON.stringify({ message: 'x'.repeat(1000) });
    expect(resumirCorpoErro(corpo).length).toBeLessThanOrEqual(300);
  });
});

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
