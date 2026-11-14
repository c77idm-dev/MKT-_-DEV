import { describe, expect, it } from 'vitest';
import { xmlNotaVendaTeste } from '../../../tests/helpers/xml-nfe';
import { ErroFiscal } from './erros';
import { interpretarXmlNotaVenda, TAMANHO_MAXIMO_XML } from './xml-nota-venda';

describe('interpretarXmlNotaVenda (spec §7.5)', () => {
  it('lê chave, emissão, emitente, destinatário (só o necessário) e itens com tributos por unidade', () => {
    const { xml, chave } = xmlNotaVendaTeste({
      itens: [{ codigo: 'FONE-01', ean: '7891234567895', descricao: 'Fone Bluetooth', quantidade: 2, valorUnitario: 100, tributado: true }],
    });
    expect(interpretarXmlNotaVenda(xml)).toEqual({
      chave,
      emitidaEm: new Date('2026-10-20T13:00:00Z'),
      cnpjEmitente: '11444777000161',
      destinatario: {
        nome: 'Maria da Silva',
        cpf: '52998224725',
        cnpj: null,
        ie: null,
        indicadorIe: 9,
        logradouro: 'Rua B',
        numero: '50',
        complemento: null,
        bairro: 'Jardim',
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01002000',
      },
      itens: [
        {
          numero: 1,
          codigo: 'FONE-01',
          ean: '7891234567895',
          descricao: 'Fone Bluetooth',
          ncm: '85183000',
          cfop: '5102',
          unidade: 'UN',
          quantidade: 2,
          valorUnitario: 100,
          desconto: 0,
          origem: 0,
          tributosPorUnidade: {
            icmsBase: 100,
            icmsAliquota: 18,
            icmsValor: 18,
            pisBase: 100,
            pisAliquota: 0.65,
            pisValor: 0.65,
            cofinsBase: 100,
            cofinsAliquota: 3,
            cofinsValor: 3,
          },
          itensDevolucaoIds: [],
        },
      ],
    });
  });

  it('Simples sem valores de tributo, "SEM GTIN" sem EAN, comprador PJ contribuinte e "&" no nome', () => {
    const { xml } = xmlNotaVendaTeste({
      destinatario: { nome: 'M&M Comercio Ltda', cpf: null, cnpj: '19131243000197', ie: '123456789', indIEDest: '1', uf: 'RJ' },
      itens: [{ codigo: 'CABO-02', ean: null, quantidade: 1, valorUnitario: 25.5 }],
    });
    const dados = interpretarXmlNotaVenda(xml);
    expect(dados.destinatario).toMatchObject({ nome: 'M&M Comercio Ltda', cpf: null, cnpj: '19131243000197', ie: '123456789', indicadorIe: 1, uf: 'RJ' });
    expect(dados.itens[0]).toMatchObject({ codigo: 'CABO-02', ean: null, cfop: '6102', valorUnitario: 25.5, tributosPorUnidade: {} });
  });

  it('recusa o que não serve, com a mensagem em português', () => {
    const base = xmlNotaVendaTeste({ itens: [{ codigo: 'A' }] });
    const digitoErrado = base.chave.slice(0, 43) + String((Number(base.chave[43]) + 1) % 10);
    const casos: [string, string][] = [
      ['nao e xml', 'O arquivo não é um XML válido.'],
      ['<?xml version="1.0"?><outro><a>1</a></outro>', 'O XML não é de uma NF-e (falta o grupo infNFe).'],
      [base.xml.replace(base.chave, digitoErrado), 'A chave de acesso do XML é inválida.'],
      [xmlNotaVendaTeste({ modelo: '65', itens: [{ codigo: 'A' }] }).xml, 'O XML não é de uma NF-e (modelo 55).'],
      [xmlNotaVendaTeste({ tpNF: '0', itens: [{ codigo: 'A' }] }).xml, 'A nota do XML não é de saída: anexe a NF de venda.'],
      [xmlNotaVendaTeste({ comProtocolo: false, itens: [{ codigo: 'A' }] }).xml, 'O XML não traz a autorização da SEFAZ: use o XML autorizado (com o protocolo).'],
      [xmlNotaVendaTeste({ cStat: '110', itens: [{ codigo: 'A' }] }).xml, 'O XML não traz a autorização da SEFAZ: use o XML autorizado (com o protocolo).'],
      [xmlNotaVendaTeste({ destinatario: { logradouro: '' }, itens: [{ codigo: 'A' }] }).xml, 'A NF de venda não traz estes dados do destinatário: logradouro.'],
      [xmlNotaVendaTeste({ itens: [{ codigo: 'A', quantidade: 0 }] }).xml, 'O item 1 da NF de venda tem quantidade zero.'],
    ];
    for (const [xml, mensagem] of casos) {
      expect(() => interpretarXmlNotaVenda(xml), mensagem).toThrow(new ErroFiscal(mensagem));
    }
  });

  it('recusa arquivo grande demais antes de ler', () => {
    expect(() => interpretarXmlNotaVenda(`<a>${'x'.repeat(TAMANHO_MAXIMO_XML)}</a>`)).toThrow('O XML passa de 1 MB: confira se é o arquivo da NF de venda.');
  });
});
