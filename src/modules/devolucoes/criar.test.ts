import { describe, expect, it } from 'vitest';
import { expandirUnidades, itensDoFormulario, validarNovaDevolucao } from './criar';

describe('validarNovaDevolucao', () => {
  it('normaliza canal pelo nome, rastreio, SKU, quantidade e data de postagem', () => {
    const { dados, erros } = validarNovaDevolucao({
      canal: 'Mercado Livre',
      pedido: ' 2000001 ',
      reclamacaoId: '',
      rastreio: ' br 123 456 ',
      transportadora: 'Correios',
      motivoCliente: '',
      postadaEm: '05/11/2026',
      itens: [
        { sku: 'fone-01', quantidade: '2' },
        { sku: 'cabo-02', quantidade: '' },
      ],
    });
    expect(erros).toEqual([]);
    expect(dados).toEqual({
      canal: 'MERCADO_LIVRE',
      pedido: '2000001',
      reclamacaoId: null,
      rastreio: 'BR123456',
      transportadora: 'Correios',
      motivoCliente: null,
      postadaEm: '2026-11-05',
      itens: [
        { sku: 'FONE-01', quantidade: 2 },
        { sku: 'CABO-02', quantidade: 1 },
      ],
    });
  });

  it('junta todos os erros', () => {
    const { dados, erros } = validarNovaDevolucao({
      canal: 'Loja X',
      pedido: '',
      postadaEm: '31/02/2026',
      itens: [
        { sku: 'A', quantidade: '0' },
        { sku: '', quantidade: '1' },
      ],
    });
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'Canal desconhecido: Loja X. Use: Mercado Livre, Amazon, Shopee, Magalu, TikTok Shop ou Shein.',
      'Informe o número do pedido',
      'Data de postagem inválida: 31/02/2026',
      'Quantidade inválida (item 1): use um número de 1 a 50',
      'Informe o SKU (item 2)',
    ]);
  });

  it('exige pelo menos um item, a não ser quando a chamada dispensa', () => {
    expect(validarNovaDevolucao({ canal: 'SHOPEE', pedido: 'P1', itens: [] }).erros).toEqual(['Informe pelo menos um item (SKU e quantidade)']);
    expect(validarNovaDevolucao({ canal: 'SHOPEE', pedido: 'P1', itens: [] }, { exigirItens: false }).erros).toEqual([]);
  });

  it('o limite de quantidade: 50 vale, 51 e 0 (número) são erro', () => {
    const com = (quantidade: string | number) => validarNovaDevolucao({ canal: 'SHOPEE', pedido: 'P1', itens: [{ sku: 'A', quantidade }] }).erros;
    expect(com(50)).toEqual([]);
    expect(com('50')).toEqual([]);
    expect(com(51)).toEqual(['Quantidade inválida: use um número de 1 a 50']);
    expect(com(0)).toEqual(['Quantidade inválida: use um número de 1 a 50']);
  });
});

describe('unidades e formulário', () => {
  it('uma unidade física por linha (spec §5.1)', () => {
    expect(
      expandirUnidades([
        { sku: 'A', quantidade: 2 },
        { sku: 'B', quantidade: 1 },
      ]),
    ).toEqual(['A', 'A', 'B']);
  });

  it('lê os pares SKU + quantidade do formulário e ignora linhas sem SKU', () => {
    const dados = new FormData();
    dados.append('sku', 'A');
    dados.append('quantidade', '2');
    dados.append('sku', '  ');
    dados.append('quantidade', '1');
    dados.append('sku', 'B');
    dados.append('quantidade', '');
    expect(itensDoFormulario(dados)).toEqual([
      { sku: 'A', quantidade: '2' },
      { sku: 'B', quantidade: '' },
    ]);
  });
});
