import { describe, expect, it } from 'vitest';
import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';
import { API_ML, ErroML } from '../mercadolivre/cliente';
import { ConectorML } from '../mercadolivre/conector';
import { idsFalsos, vendedorFalso } from '../mercadolivre/falso';
import { criarClienteViaBitbrain, ErroBitbrain, listarEmpresasBitbrain } from './cliente';
import { caminhoPermitido, EMPRESA_FALSA_FORA_DO_AR, EMPRESAS_FALSAS, fetchBitbrainFalso, RECLAMACOES_FALSAS_POR_EMPRESA } from './falso';

const [loja1, loja2] = EMPRESAS_FALSAS;
const cliente = (empresa: string, token = TOKEN_BITBRAIN_FALSO) =>
  criarClienteViaBitbrain({ url: URL_BITBRAIN_FALSO, token, empresa, fetchFn: fetchBitbrainFalso });
const conector = (e: { empresa: string; seller_id: string }) => new ConectorML({ sellerId: e.seller_id, cliente: cliente(e.empresa) });

describe('Bitbrain falso (D3)', () => {
  it('/empresas lista as duas lojas falsas; a 1ª é o vendedor do ML falso', async () => {
    expect(await listarEmpresasBitbrain({ url: URL_BITBRAIN_FALSO, token: TOKEN_BITBRAIN_FALSO, fetchFn: fetchBitbrainFalso })).toEqual([
      { empresa: 'loja-falsa-1', nome: 'Loja Falsa 1', sellerId: '123456789' },
      { empresa: 'loja-falsa-2', nome: 'Loja Falsa 2', sellerId: '223456789' },
    ]);
    expect(loja1.seller_id).toBe(vendedorFalso());
  });

  it('token errado: 401 vira ErroBitbrain token', async () => {
    await expect(cliente(loja1.empresa, 'errado').get('/orders/1')).rejects.toMatchObject({ motivo: 'token', status: 401 });
  });

  it('a busca de cada empresa acha as reclamações fixas dela', async () => {
    for (const e of [loja1, loja2]) {
      const vistas: string[] = [];
      for await (const r of conector(e).reclamacoesAtualizadasDesde(new Date())) vistas.push(r.reclamacaoId);
      expect(vistas).toEqual(RECLAMACOES_FALSAS_POR_EMPRESA[e.empresa]);
    }
  });

  it('o ConectorML real sobre o Bitbrain falso: cenário 2 com os extras', async () => {
    const dados = await conector(loja1).obterReclamacao('5200000001');
    expect(dados.devolucao).toMatchObject({ reclamacaoId: '5200000001', statusCanal: 'delivered/delivered', itens: [{ sku: 'MLF-FONE-01', quantidade: 1 }] });
    expect(dados.extras).toMatchObject({ urgente: true, afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
    // Produtos do ML (extra): o anúncio passa pelo Bitbrain como veio (título, GTIN e foto).
    expect(dados.produtos).toEqual([
      expect.objectContaining({ sku: 'MLF-FONE-01', descricao: 'Fone de Ouvido Bluetooth MLF', ean: '7891234567895', fotoUrl: 'https://imagens.ml-falso.example/mlf-fone-01.png' }),
    ]);
  });

  it('ficha da venda (extra, E27): o pedido sem dados pessoais ainda traz situação, data, itens e valores', async () => {
    const ids = idsFalsos(2, '00000001');
    expect((await conector(loja1).obterReclamacao('5200000001')).vendas).toEqual([
      {
        pedidoId: ids.pedidos[0],
        vendidaEm: new Date('2026-10-28T09:00:00.000-03:00'),
        situacao: 'paid',
        situacaoEnvio: 'delivered',
        itens: [{ anuncioId: ids.itens[0], titulo: 'Fone de Ouvido Bluetooth MLF', sku: 'MLF-FONE-01', variacaoId: null, quantidade: 1, valorUnitario: 129.9 }],
      },
    ]);
  });

  it('cenário 5 pela loja 2: triagem do ML', async () => {
    expect((await conector(loja2).obterReclamacao('5500000002')).extras).toMatchObject({ triagemCondicao: 'NAO_VENDAVEL' });
  });

  it('LGPD: o pedido sai sem buyer e payments, com shipping.id; o envio sai sem endereço; a devolução, sem shipping_address', async () => {
    const ids = idsFalsos(2, '00000001');
    const pedido = await cliente(loja1.empresa).get<Record<string, unknown>>(`/orders/${ids.pedidos[0]}`);
    expect(pedido).not.toHaveProperty('buyer');
    expect(pedido).not.toHaveProperty('payments');
    expect(pedido).toHaveProperty('shipping.id');
    const envio = await cliente(loja1.empresa).get<Record<string, unknown>>(`/shipments/${ids.enviosVenda[0]}`);
    expect(Object.keys(envio).sort()).toEqual(expect.arrayContaining(['id', 'logistic_type', 'status']));
    expect(envio).not.toHaveProperty('receiver_address');
    const devolucao = await cliente(loja1.empresa).get<{ shipments: { destination: Record<string, unknown> }[] }>(`/post-purchase/v2/claims/${ids.reclamacaoId}/returns`);
    expect(devolucao.shipments[0].destination).toEqual({ name: 'seller_address' });
  });

  it('NF de venda: o XML inteiro pela empresa', async () => {
    const xml = await conector(loja1).obterXmlNotaVenda(idsFalsos(2, '00000001').pedidos[0]);
    expect(xml).toContain('<nfeProc');
  });

  it('lista fechada: fora da lista, seller de outra empresa e parâmetro a mais dão 403 (ErroBitbrain caminho)', async () => {
    const c = cliente(loja1.empresa);
    await expect(c.get('/post-purchase/v1/returns/reasons?flow=seller_return_failed&claim_id=1')).rejects.toMatchObject({ motivo: 'caminho' });
    await expect(c.get(`/users/${loja2.seller_id}/invoices/orders/1`)).rejects.toMatchObject({ motivo: 'caminho' });
    const busca = `/post-purchase/v1/claims/search?player_user_id=${loja1.seller_id}&player_role=respondent&range=last_updated:after:x&limit=100&offset=0`;
    await expect(c.get(`${busca}&status=opened`)).rejects.toBeInstanceOf(ErroBitbrain);
  });

  it('empresa desconhecida: 404 ErroBitbrain empresa; empresa fora do ar: ErroML 504 (rede do ML)', async () => {
    await expect(cliente('nao-existe').get('/orders/1')).rejects.toMatchObject({ motivo: 'empresa' });
    const erro = await cliente(EMPRESA_FALSA_FORA_DO_AR).get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 504 });
  });
});

describe('caminhoPermitido (os 12 da lista fechada)', () => {
  const ok = (c: string, s = '123') => caminhoPermitido(new URL(c, API_ML), s);
  it('aceita os 12 formatos', () => {
    for (const c of [
      '/post-purchase/v1/claims/search?player_user_id=123&player_role=respondent&range=last_updated:after:2026-11-01T00:00:00.000-0300&limit=100&offset=9900',
      '/post-purchase/v1/claims/5',
      '/post-purchase/v2/claims/5/returns',
      '/post-purchase/v1/claims/5/affects-reputation',
      '/post-purchase/v1/returns/6/reviews',
      '/post-purchase/v1/claims/reasons/PDD9949',
      '/orders/2000000200000001',
      '/items/MLB123',
      '/shipments/4',
      '/users/123/invoices/orders/9',
      '/invoices/orders/9',
      '/users/123/invoices/documents/xml/ABC_1-2/authorized',
    ]) {
      expect(ok(c), c).toBe(true);
    }
  });

  it('recusa o resto', () => {
    for (const c of [
      '/post-purchase/v1/claims/search?player_user_id=999&player_role=respondent&range=last_updated:after:x&limit=100&offset=0',
      '/post-purchase/v1/claims/search?player_user_id=123&player_role=respondent&range=last_updated:after:x&limit=101&offset=0',
      '/post-purchase/v1/claims/search?player_user_id=123&player_role=respondent&range=last_updated:after:x&limit=100&offset=9901',
      '/post-purchase/v1/returns/reasons',
      '/post-purchase/v1/claims/5?x=1',
      '/items/ABC123',
      '/users/999/invoices/orders/9',
      '/users/me',
    ]) {
      expect(ok(c), c).toBe(false);
    }
  });
});
