/**
 * Mapeamento puro sobre o JSON do ML. Os exemplos vêm de tests/fixtures/ml/doc (montados a partir da documentação).
 * Na "Ligação das contas reais", acrescente aqui um describe com as respostas reais de tests/fixtures/ml/real.
 */
import { describe, expect, it } from 'vitest';
import anuncio from '../../../../tests/fixtures/ml/doc/anuncio.json';
import devolucao from '../../../../tests/fixtures/ml/doc/devolucao.json';
import envio from '../../../../tests/fixtures/ml/doc/envio.json';
import pedido from '../../../../tests/fixtures/ml/doc/pedido.json';
import motivoReclamacao from '../../../../tests/fixtures/ml/doc/motivo-reclamacao.json';
import reclamacao from '../../../../tests/fixtures/ml/doc/reclamacao.json';
import { esquemaAnuncio, esquemaDevolucao, esquemaReclamacao } from './esquemas';
import {
  ErroFormatoML,
  EXTRAS_VAZIOS,
  extrasDaReclamacao,
  gtinDoAnuncio,
  idEnvioDaVenda,
  mapearReclamacao, prazoDaReclamacao, quantidadeML, temDevolucao, textoMotivoReclamacao } from './mapeamento';

const COMPLETA = { reclamacao, devolucao, pedidos: [pedido], anuncios: [anuncio], envio };

describe('mapearReclamacao (spec §7.2 e §7.3)', () => {
  it('monta a DevolucaoExterna a partir da reclamação, devolução, pedido, anúncio e envio', () => {
    expect(mapearReclamacao(COMPLETA)).toEqual({
      reclamacaoId: '5292183123',
      statusReclamacao: 'opened',
      motivoId: 'PDD9949',
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
      extras: { ...EXTRAS_VAZIOS, acaoPendente: 'return_review_ok', urgente: false, dinheiro: 'RETIDO' },
    });
  });

  it('reclamação sem devolução (só mediação): devolucao null', () => {
    const r = mapearReclamacao({ reclamacao: { ...reclamacao, related_entities: [] }, devolucao: null, pedidos: [], anuncios: [], envio: null });
    expect(r).toMatchObject({ reclamacaoId: '5292183123', devolucao: null, subtipo: null, statusDevolucao: null });
  });

  it('lê o reason_id da reclamação (motivoId), também sem devolução; sem reason_id fica null', () => {
    expect(mapearReclamacao(COMPLETA).motivoId).toBe('PDD9949');
    const semDevolucao = mapearReclamacao({ reclamacao: { ...reclamacao, related_entities: [] }, devolucao: null, pedidos: [], anuncios: [], envio: null });
    expect(semDevolucao.motivoId).toBe('PDD9949');
    expect(mapearReclamacao({ ...COMPLETA, reclamacao: { ...reclamacao, reason_id: null } }).motivoId).toBeNull();
  });

  it('reason_id de tipo inesperado não quebra a reclamação: motivoId null', () => {
    const r = mapearReclamacao({ ...COMPLETA, reclamacao: { ...reclamacao, reason_id: {} } });
    expect(r.motivoId).toBeNull();
    expect(r.devolucao?.devolucaoExternaId).toBe('14958493');
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

describe('textoMotivoReclamacao (suposição A15: GET /post-purchase/v1/claims/reasons/{id})', () => {
  it('usa detail; senão description; senão name que não é código; o resto vira null', () => {
    expect(textoMotivoReclamacao(motivoReclamacao)).toBe('Comprador se arrependeu');
    expect(textoMotivoReclamacao({ id: 'X', description: ' Produto com defeito ' })).toBe('Produto com defeito');
    expect(textoMotivoReclamacao({ id: 'X', name: 'Produto com defeito' })).toBe('Produto com defeito');
    expect(textoMotivoReclamacao({ id: 'X', name: 'repentant_buyer' })).toBeNull();
    expect(textoMotivoReclamacao({ id: 'X', detail: '   ' })).toBeNull();
    for (const ruim of [null, [], 'x', 42, { detail: 7 }]) expect(textoMotivoReclamacao(ruim)).toBeNull();
  });

  it('corta o texto em 500 caracteres (o mesmo limite do motivo manual e da planilha)', () => {
    expect(textoMotivoReclamacao({ detail: `  ${'a'.repeat(600)}  ` })).toBe('a'.repeat(500));
  });
});

describe('extrasDaReclamacao (integração Bitbrain §4.5)', () => {
  const r = esquemaReclamacao.parse(reclamacao);
  const d = esquemaDevolucao.parse(devolucao);
  const f = (m: Partial<Parameters<typeof extrasDaReclamacao>[0]> = {}) =>
    extrasDaReclamacao({ reclamacao: r, devolucao: d, reputacao: null, revisoes: null, envioVenda: null, ...m });

  it('só a reclamação e a devolução: a revisão com prazo, não urgente, e o dinheiro do status_money', () => {
    expect(f()).toEqual({ ...EXTRAS_VAZIOS, acaoPendente: 'return_review_ok', urgente: false, dinheiro: 'RETIDO' });
  });

  it('ação obrigatória (mandatory) da loja → urgente, com a ação de prazo mais curto (A19, D7)', () => {
    const urgente = esquemaReclamacao.parse({
      ...reclamacao,
      players: [
        {
          role: 'respondent',
          type: 'seller',
          user_id: 1,
          available_actions: [
            { action: 'send_message_to_complainant', due_date: '2026-11-22T10:00:00.000-03:00', mandatory: true },
            { action: 'return_review_fail', due_date: '2026-11-19T10:00:00.000-03:00', mandatory: true },
          ],
        },
      ],
    });
    expect(f({ reclamacao: urgente })).toMatchObject({ acaoPendente: 'return_review_fail', urgente: true });
  });

  it('sem a loja entre os players: ação e urgente nulos (o ML não informou)', () => {
    const semLoja = esquemaReclamacao.parse({ ...reclamacao, players: [{ role: 'complainant', type: 'buyer', user_id: 2, available_actions: [] }] });
    expect(f({ reclamacao: semLoja })).toMatchObject({ acaoPendente: null, urgente: null });
  });

  it('reputação: affected/not_affected/not_applies; valor estranho ou resposta ruim → nulo (A17)', () => {
    expect(f({ reputacao: { affects_reputation: 'affected' } }).afetaReputacao).toBe('AFETA');
    expect(f({ reputacao: { affects_reputation: 'not_affected' } }).afetaReputacao).toBe('NAO_AFETA');
    expect(f({ reputacao: { affects_reputation: 'not_applies' } }).afetaReputacao).toBe('NAO_SE_APLICA');
    expect(f({ reputacao: { affects_reputation: 'talvez' } }).afetaReputacao).toBeNull();
    expect(f({ reputacao: 'x' }).afetaReputacao).toBeNull();
  });

  it('Full pelo logistic_type ou pelo logistic.type (A18); outro tipo → false; sem envio → nulo', () => {
    expect(f({ envioVenda: { id: 1, logistic_type: 'fulfillment' } }).ehFull).toBe(true);
    expect(f({ envioVenda: { id: 1, logistic: { mode: 'me2', type: 'fulfillment' } } }).ehFull).toBe(true);
    expect(f({ envioVenda: { id: 1, logistic_type: 'drop_off' } }).ehFull).toBe(false);
    expect(f({ envioVenda: { id: 1 } }).ehFull).toBeNull();
    expect(f({ envioVenda: null }).ehFull).toBeNull();
  });

  it('triagem: a última revisão com product_condition, em { reviews } ou em lista (A16)', () => {
    const revisoes = {
      reviews: [
        { resource_reviews: [{ product_condition: 'saleable', stage: 'pending' }] },
        { resource_reviews: [{ product_condition: null, stage: 'x' }, { product_condition: 'unsaleable', stage: 'closed' }] },
      ],
    };
    expect(f({ revisoes })).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL', triagemEtapa: 'closed' });
    expect(f({ revisoes: revisoes.reviews })).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL', triagemEtapa: 'closed' });
    expect(f({ revisoes: { reviews: [] } })).toMatchObject({ triagemCondicao: null, triagemEtapa: null });
  });

  it('dinheiro: retained/refunded/available; sem devolução → nulo', () => {
    expect(f({ devolucao: esquemaDevolucao.parse({ ...devolucao, status_money: 'refunded' }) }).dinheiro).toBe('DEVOLVIDO');
    expect(f({ devolucao: esquemaDevolucao.parse({ ...devolucao, status_money: 'available' }) }).dinheiro).toBe('LIBERADO');
    expect(f({ devolucao: null }).dinheiro).toBeNull();
  });

  it('idEnvioDaVenda: o shipping.id do 1º pedido que tiver; nenhum → nulo', () => {
    expect(idEnvioDaVenda([pedido])).toBe('41800000001');
    expect(idEnvioDaVenda([{ id: 1, order_items: [] }])).toBeNull();
    expect(idEnvioDaVenda([])).toBeNull();
  });

  it('mapearReclamacao devolve os extras nos dois retornos', () => {
    const semDevolucao = mapearReclamacao({ reclamacao: { ...reclamacao, related_entities: [] }, devolucao: null, pedidos: [], anuncios: [], envio: null });
    expect(semDevolucao.extras).toMatchObject({ acaoPendente: 'return_review_ok', urgente: false, dinheiro: null });
    const comTudo = mapearReclamacao({
      reclamacao,
      devolucao,
      pedidos: [pedido],
      anuncios: [],
      envio: null,
      reputacao: { affects_reputation: 'affected' },
      envioVenda: { id: 41800000001, logistic_type: 'fulfillment' },
    });
    expect(comTudo.extras).toMatchObject({ afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
  });
});
