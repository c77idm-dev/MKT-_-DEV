/**
 * Mapeamento puro sobre o JSON do ML. Os exemplos vêm de tests/fixtures/ml/doc (montados a partir da documentação).
 * Na "Ligação das contas reais", acrescente aqui um describe com as respostas reais de tests/fixtures/ml/real.
 */
import { describe, expect, it } from 'vitest';
import anuncio from '../../../../tests/fixtures/ml/doc/anuncio.json';
import devolucao from '../../../../tests/fixtures/ml/doc/devolucao.json';
import envio from '../../../../tests/fixtures/ml/doc/envio.json';
import pedido from '../../../../tests/fixtures/ml/doc/pedido.json';
import reclamacao from '../../../../tests/fixtures/ml/doc/reclamacao.json';
import { esquemaAnuncio, esquemaReclamacao } from './esquemas';
import { ErroFormatoML, gtinDoAnuncio, mapearReclamacao, prazoDaReclamacao, quantidadeML, temDevolucao } from './mapeamento';

const COMPLETA = { reclamacao, devolucao, pedidos: [pedido], anuncios: [anuncio], envio };

describe('mapearReclamacao (spec §7.2 e §7.3)', () => {
  it('monta a DevolucaoExterna a partir da reclamação, devolução, pedido, anúncio e envio', () => {
    expect(mapearReclamacao(COMPLETA)).toEqual({
      reclamacaoId: '5292183123',
      statusReclamacao: 'opened',
      subtipo: 'return_total',
      statusDevolucao: 'shipped',
      atualizadaEm: new Date('2026-11-09T14:20:00.000-03:00'),
      devolucao: {
        canal: 'MERCADO_LIVRE',
        devolucaoExternaId: '14958493',
        reclamacaoId: '5292183123',
        tipo: 'DEVOLUCAO',
        semEnvioFisico: false,
        pedidos: ['2000008003035430'],
        statusCanal: 'shipped/shipped',
        destinoEnvio: 'VENDEDOR',
        reenvioDaTriagem: false,
        rastreio: 'QB123456789BR',
        transportadora: 'Correios',
        entregueEm: null,
        prazoConferencia: new Date('2026-11-20T23:59:59.000-03:00'),
        atualizadaEm: new Date('2026-11-09T14:20:00.000-03:00'),
        itens: [{ pedido: '2000008003035430', sku: 'fone-01', ean: '7891234567888', quantidade: 1 }],
      },
    });
  });

  it('reclamação sem devolução (só mediação): devolucao null', () => {
    const r = mapearReclamacao({ reclamacao: { ...reclamacao, related_entities: [] }, devolucao: null, pedidos: [], anuncios: [], envio: null });
    expect(r).toMatchObject({ reclamacaoId: '5292183123', devolucao: null, subtipo: null, statusDevolucao: null });
  });

  it('low_cost: sem envio físico (D10)', () => {
    const r = mapearReclamacao({ ...COMPLETA, devolucao: { ...devolucao, subtype: 'low_cost', status: 'closed', shipments: [] }, envio: null });
    expect(r.devolucao).toMatchObject({ semEnvioFisico: true, destinoEnvio: null, rastreio: null, statusCanal: 'closed' });
    expect(r.subtipo).toBe('low_cost');
  });

  it('entregue ao vendedor: preenche entregueEm com a data do envio', () => {
    const r = mapearReclamacao({
      ...COMPLETA,
      devolucao: { ...devolucao, status: 'delivered' },
      envio: { ...envio, status: 'delivered', status_history: { date_delivered: '2026-11-10T11:00:00.000-03:00' } },
    });
    expect(r.devolucao).toMatchObject({ statusCanal: 'delivered/delivered', entregueEm: new Date('2026-11-10T11:00:00.000-03:00') });
  });

  it('destino warehouse vira CD do marketplace; o reenvio da triagem ganha do envio de devolução', () => {
    const cd = { ...devolucao.shipments[0], destination: { name: 'warehouse' } };
    expect(mapearReclamacao({ ...COMPLETA, devolucao: { ...devolucao, shipments: [cd] }, envio: null }).devolucao).toMatchObject({
      destinoEnvio: 'CD_MARKETPLACE',
      reenvioDaTriagem: false,
    });
    const triagem = { shipment_id: 41896532999, status: 'shipped', tracking_number: 'QB999999999BR', type: 'return_from_triage', destination: { name: 'seller_address' } };
    expect(mapearReclamacao({ ...COMPLETA, devolucao: { ...devolucao, shipments: [cd, triagem] }, envio: null }).devolucao).toMatchObject({
      destinoEnvio: 'VENDEDOR',
      reenvioDaTriagem: true,
      rastreio: 'QB999999999BR',
    });
  });

  it('dois pedidos, quantidade em texto e SKU de reserva (seller_custom_field, depois o id do anúncio)', () => {
    const doisPedidos = {
      ...devolucao,
      orders: [
        { order_id: 2000008003035430, item_id: 'MLB3456789012', variation_id: null, total_quantity: '2.0', return_quantity: '2.0' },
        { order_id: '20000080030354301234', item_id: 'MLB0000000001', variation_id: null, total_quantity: '1.0', return_quantity: null },
      ],
    };
    const semSku = { ...pedido, order_items: [{ ...pedido.order_items[0], item: { ...pedido.order_items[0].item, seller_sku: null, seller_custom_field: 'CUSTOM-1' } }] };
    const r = mapearReclamacao({ ...COMPLETA, devolucao: doisPedidos, pedidos: [semSku], anuncios: [], envio: null });
    expect(r.devolucao?.pedidos).toEqual(['2000008003035430', '20000080030354301234']);
    expect(r.devolucao?.itens).toEqual([
      { pedido: '2000008003035430', sku: 'CUSTOM-1', ean: null, quantidade: 2 },
      { pedido: '20000080030354301234', sku: 'MLB0000000001', ean: null, quantidade: 1 },
    ]);
  });

  it('troca (type change) vira TROCA', () => {
    expect(mapearReclamacao({ ...COMPLETA, reclamacao: { ...reclamacao, type: 'change' } }).devolucao?.tipo).toBe('TROCA');
  });

  it('resposta fora do formato é ErroFormatoML, dizendo o quê e o campo', () => {
    const semStatus: Record<string, unknown> = { ...devolucao };
    delete semStatus.status;
    expect(() => mapearReclamacao({ ...COMPLETA, devolucao: semStatus })).toThrow(ErroFormatoML);
    expect(() => mapearReclamacao({ ...COMPLETA, devolucao: semStatus })).toThrow(/devolução.*status/);
  });
});

describe('funções do mapeamento', () => {
  it('temDevolucao aceita "return" e "returns" (spec §7.6, ponto 5)', () => {
    expect(temDevolucao(['return'])).toBe(true);
    expect(temDevolucao(['changes', 'returns'])).toBe(true);
    expect(temDevolucao([])).toBe(false);
  });

  it('prazoDaReclamacao: o menor due_date das ações de revisão do vendedor', () => {
    const r = esquemaReclamacao.parse({
      ...reclamacao,
      players: [
        { role: 'complainant', type: 'buyer', user_id: 1, available_actions: [{ action: 'return_review_ok', due_date: '2026-11-01T00:00:00.000-03:00' }] },
        {
          role: 'respondent',
          type: 'seller',
          user_id: 2,
          available_actions: [
            { action: 'return_review_fail', due_date: '2026-11-21T00:00:00.000-03:00' },
            { action: 'return_review_ok', due_date: '2026-11-20T00:00:00.000-03:00' },
            { action: 'send_message_to_complainant', due_date: '2026-11-02T00:00:00.000-03:00' },
          ],
        },
      ],
    });
    expect(prazoDaReclamacao(r)).toEqual(new Date('2026-11-20T00:00:00.000-03:00'));
  });

  it('gtinDoAnuncio prefere o da variação e recusa tamanho inválido', () => {
    const a = esquemaAnuncio.parse(anuncio);
    expect(gtinDoAnuncio(a, '178234567890')).toBe('7891234567888');
    expect(gtinDoAnuncio(a, null)).toBe('7891234567895');
    expect(gtinDoAnuncio(esquemaAnuncio.parse({ id: 'X', attributes: [{ id: 'GTIN', value_name: '123' }] }), null)).toBeNull();
  });

  it('quantidadeML entende "1.0", "2,0" e recusa zero', () => {
    expect(quantidadeML('1.0')).toBe(1);
    expect(quantidadeML('2,0')).toBe(2);
    expect(quantidadeML('0')).toBeNull();
    expect(quantidadeML(null)).toBeNull();
  });
});
