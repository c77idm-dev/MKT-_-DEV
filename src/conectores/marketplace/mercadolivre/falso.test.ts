import { describe, expect, it } from 'vitest';
import { criarClienteML } from './cliente';
import { ConectorML } from './conector';
import {
  digitoChaveNFe,
  fetchFalsoML,
  idReclamacaoFalsa,
  idsDaReclamacaoFalsa,
  REFRESH_REVOGADO,
  urlAutorizacaoFalsa,
  vendedorFalso,
  type IdsFalsos,
} from './falso';
import { renovarTokens, trocarCodigo } from './oauth';

function conector(accessToken = 'APP_USR-FALSO-TESTE') {
  return new ConectorML({ sellerId: vendedorFalso(), cliente: criarClienteML({ accessToken, fetchFn: fetchFalsoML }) });
}

function novo(cenario: number): { id: string; ids: IdsFalsos } {
  const id = idReclamacaoFalsa(cenario);
  const ids = idsDaReclamacaoFalsa(id);
  if (!ids) throw new Error(`id falso inválido: ${id}`);
  return { id, ids };
}

describe('ML falso: o ConectorML real sobre as respostas da documentação', () => {
  it('cenário 1: devolução a caminho do vendedor, com prazo', async () => {
    const { id, ids } = novo(1);
    const dados = await conector().obterReclamacao(id);
    expect(dados.devolucao).toMatchObject({
      devolucaoExternaId: ids.devolucaoId,
      reclamacaoId: id,
      pedidos: ids.pedidos,
      statusCanal: 'shipped/shipped',
      destinoEnvio: 'VENDEDOR',
      rastreio: ids.rastreio,
      transportadora: 'Correios',
      semEnvioFisico: false,
      itens: [{ pedido: ids.pedidos[0], sku: 'MLF-FONE-01', ean: '7891234567895', quantidade: 1 }],
    });
    expect(dados.devolucao?.prazoConferencia).toBeInstanceOf(Date);
  });

  it('cenário 2: entregue ao vendedor, com data de entrega', async () => {
    const dados = await conector().obterReclamacao(novo(2).id);
    expect(dados.devolucao).toMatchObject({ statusCanal: 'delivered/delivered', destinoEnvio: 'VENDEDOR' });
    expect(dados.devolucao?.entregueEm).toBeInstanceOf(Date);
  });

  it('cenário 3: low_cost, sem envio físico', async () => {
    const dados = await conector().obterReclamacao(novo(3).id);
    expect(dados.subtipo).toBe('low_cost');
    expect(dados.devolucao).toMatchObject({ semEnvioFisico: true, rastreio: null });
  });

  it('cenário 4: no CD do ML; cenário 5: reenvio da triagem', async () => {
    expect((await conector().obterReclamacao(novo(4).id)).devolucao).toMatchObject({ destinoEnvio: 'CD_MARKETPLACE', reenvioDaTriagem: false });
    expect((await conector().obterReclamacao(novo(5).id)).devolucao).toMatchObject({ destinoEnvio: 'VENDEDOR', reenvioDaTriagem: true });
  });

  it('cenário 7: dois pedidos e quantidade 2', async () => {
    const { id, ids } = novo(7);
    const dados = await conector().obterReclamacao(id);
    expect(dados.devolucao?.pedidos).toEqual(ids.pedidos);
    expect(dados.devolucao?.itens).toEqual([
      { pedido: ids.pedidos[0], sku: 'MLF-FONE-01', ean: '7891234567895', quantidade: 2 },
      { pedido: ids.pedidos[1], sku: 'MLF-CABO-02', ean: '7891234567895', quantidade: 1 },
    ]);
  });

  it('cenário 9: reclamação sem devolução', async () => {
    expect((await conector().obterReclamacao(novo(9).id)).devolucao).toBeNull();
  });

  it('id fora dos cenários: 404; token sem o prefixo falso: 401', async () => {
    await expect(conector().obterReclamacao('123')).rejects.toMatchObject({ status: 404 });
    await expect(conector('OUTRO').obterReclamacao(novo(1).id)).rejects.toMatchObject({ status: 401 });
  });

  it('revisão OK passa; no cenário 8 o ML recusa com 400', async () => {
    await expect(conector().enviarResultadoConferencia(novo(1).ids.devolucaoId, { tipo: 'OK' })).resolves.toBeUndefined();
    const { id, ids } = novo(8);
    const erro = await conector()
      .enviarResultadoConferencia(ids.devolucaoId, {
        tipo: 'PROBLEMA',
        reclamacaoId: id,
        motivo: 'SRF2',
        mensagem: 'Chegou quebrado.',
        anexos: [{ nome: 'f.jpg', conteudo: Buffer.from('x'), tipoConteudo: 'image/jpeg' }],
      })
      .catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 400 });
  });

  it('NF de venda: XML com o SKU do cenário e chave de 44 dígitos com dígito verificador certo', async () => {
    const { ids } = novo(1);
    const xml = (await conector().obterXmlNotaVenda(ids.pedidos[0])) ?? '';
    expect(xml).toContain('<cProd>MLF-FONE-01</cProd>');
    const chave = /<chNFe>(\d{44})<\/chNFe>/.exec(xml)?.[1] ?? '';
    expect(chave).toHaveLength(44);
    expect(digitoChaveNFe(chave.slice(0, 43))).toBe(chave[43]);
    expect(await conector().obterXmlNotaVenda('999')).toBeNull();
  });
});

describe('OAuth falso', () => {
  it('"Conectar" volta direto ao retorno com um código falso, que vira tokens do vendedor falso', async () => {
    const url = new URL(urlAutorizacaoFalsa('abc'), 'http://localhost');
    expect(url.pathname).toBe('/api/ml/retorno');
    expect(url.searchParams.get('state')).toBe('abc');
    const tokens = await trocarCodigo({ clientId: '', clientSecret: '', code: url.searchParams.get('code') ?? '', redirectUri: '', fetchFn: fetchFalsoML });
    expect(tokens.userId).toBe(Number(vendedorFalso()));
    expect(tokens.accessToken.startsWith('APP_USR-FALSO-')).toBe(true);
  });

  it('refresh revogado: 400 invalid_grant', async () => {
    await expect(renovarTokens({ clientId: '', clientSecret: '', refreshToken: REFRESH_REVOGADO, fetchFn: fetchFalsoML })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('digitoChaveNFe (módulo 11)', () => {
  it('confere com a chave do exemplo do Manual da NF-e', () => {
    expect(digitoChaveNFe('5206043300991100250655012000000780026730161')).toBe('5');
  });
});
