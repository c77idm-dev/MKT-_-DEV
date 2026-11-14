import { describe, expect, it } from 'vitest';
import { DESTINATARIO_TESTE, EMITENTE_TESTE } from '../../../tests/helpers/nota-teste';
import type { ConfiguracaoFiscal } from './configuracao';
import type { ItemNotaVenda } from './dominio';
import {
  montarNotaDevolucaoPura,
  preencherInformacoes,
  type EntradaMontagem,
  type NotaVendaMontagem,
  type UnidadeMontagem,
} from './montar-devolucao';
import { sugestaoDeRegra } from './regras';

const CHAVE_A = '35261011444777000161550010000001011000001012';
const CHAVE_B = '35261011444777000161550010000001021000001028';
const NV_A = '11111111-1111-4111-8111-111111111111';
const NV_B = '22222222-2222-4222-8222-222222222222';
const CONFIG: ConfiguracaoFiscal = { emitente: EMITENTE_TESTE, regime: 'SIMPLES', serie: '1', ambiente: 'HOMOLOGACAO' };
const TRIBUTOS_POR_UNIDADE = {
  icmsBase: 100,
  icmsAliquota: 18,
  icmsValor: 18,
  pisBase: 100,
  pisAliquota: 0.65,
  pisValor: 0.65,
  cofinsBase: 100,
  cofinsAliquota: 3,
  cofinsValor: 3,
};

function itemVenda(dados: Partial<ItemNotaVenda> & { numero: number; codigo: string }): ItemNotaVenda {
  return {
    ean: null,
    descricao: `Produto ${dados.codigo}`,
    ncm: '85183000',
    cfop: '5102',
    unidade: 'UN',
    quantidade: 1,
    valorUnitario: 100,
    desconto: 0,
    origem: 0,
    tributosPorUnidade: {},
    itensDevolucaoIds: [],
    ...dados,
  };
}
function notaVenda(notaVendaId: string, chave: string, itens: ItemNotaVenda[], destinatario = DESTINATARIO_TESTE): NotaVendaMontagem {
  return { notaVendaId, chave, origem: 'ANEXO', emitidaEm: null, destinatario, itens };
}
function unidade(itemId: string, n: number, sku: string, extra: Partial<UnidadeMontagem> = {}): UnidadeMontagem {
  return { itemId, unidade: n, sku, ean: null, serial: null, destino: 'BOM', descricao: null, ...extra };
}
function entrada(dados: Partial<EntradaMontagem> = {}): EntradaMontagem {
  return {
    referencia: 'ref123',
    codigo: 'DEV-000001',
    config: CONFIG,
    regra: sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'),
    unidades: [
      unidade('a', 1, 'FONE-01', { serial: 'SN1' }),
      unidade('b', 2, 'FONE-01', { destino: 'PROBLEMA' }),
      unidade('c', 3, 'CABO-02', { ean: '7891234567895' }),
    ],
    notasVenda: [
      notaVenda(NV_A, CHAVE_A, [
        itemVenda({ numero: 1, codigo: 'FONE-01', quantidade: 2, valorUnitario: 99.95 }),
        itemVenda({ numero: 2, codigo: 'CABO-ORIG', ean: '7891234567895', valorUnitario: 25.5 }),
      ]),
    ],
    ...dados,
  };
}

describe('montarNotaDevolucaoPura (spec §8.4)', () => {
  it('Simples: finalidade devolução, entrada, chave da venda, CFOP da regra, um item por item da venda, sem valores de tributo', () => {
    expect(montarNotaDevolucaoPura(entrada())).toEqual({
      referencia: 'ref123',
      tipo: 'DEVOLUCAO_VENDA',
      naturezaOperacao: 'Devolucao de venda',
      entrada: true,
      finalidade: 'DEVOLUCAO',
      operacao: 'DENTRO_ESTADO',
      consumidorFinal: true,
      regime: 'SIMPLES',
      emitente: EMITENTE_TESTE,
      destinatario: DESTINATARIO_TESTE,
      chavesReferenciadas: [CHAVE_A],
      itens: [
        {
          codigo: 'FONE-01',
          descricao: 'Produto FONE-01',
          ncm: '85183000',
          cfop: '1202',
          unidade: 'UN',
          quantidade: 2,
          valorUnitario: 99.95,
          ean: null,
          icmsOrigem: 0,
          icmsSituacao: '900',
          pisSituacao: '98',
          cofinsSituacao: '98',
        },
        {
          codigo: 'CABO-ORIG',
          descricao: 'Produto CABO-ORIG',
          ncm: '85183000',
          cfop: '1202',
          unidade: 'UN',
          quantidade: 1,
          valorUnitario: 25.5,
          ean: '7891234567895',
          icmsOrigem: 0,
          icmsSituacao: '900',
          pisSituacao: '98',
          cofinsSituacao: '98',
        },
      ],
      informacoesComplementares: `Devolucao referente a NF-e ${CHAVE_A}. Devolucao DEV-000001.`,
    });
  });

  it('Lucro Presumido: CST 00 e PIS/COFINS 01 levam base, alíquota e valor proporcionais à quantidade devolvida', () => {
    const regra = { ...sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'PRESUMIDO'), pisSituacaoTributaria: '01', cofinsSituacaoTributaria: '01' };
    const nota = montarNotaDevolucaoPura(
      entrada({
        config: { ...CONFIG, regime: 'PRESUMIDO' },
        regra,
        unidades: [unidade('a', 1, 'FONE-01'), unidade('b', 2, 'FONE-01')],
        notasVenda: [notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', quantidade: 3, tributosPorUnidade: TRIBUTOS_POR_UNIDADE })])],
      }),
    );
    expect(nota.regime).toBe('PRESUMIDO');
    expect(nota.itens).toEqual([
      expect.objectContaining({
        quantidade: 2,
        icmsSituacao: '00',
        pisSituacao: '01',
        cofinsSituacao: '01',
        tributos: { icmsBase: 200, icmsAliquota: 18, icmsValor: 36, pisBase: 200, pisAliquota: 0.65, pisValor: 1.3, cofinsBase: 200, cofinsAliquota: 3, cofinsValor: 6 },
      }),
    ]);
  });

  it('Lucro Real com CST 41 e PIS/COFINS 98: sem valores; no Simples os valores da venda nunca vão', () => {
    const venda = [notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', tributosPorUnidade: TRIBUTOS_POR_UNIDADE })])];
    const real = montarNotaDevolucaoPura(
      entrada({
        config: { ...CONFIG, regime: 'REAL' },
        regra: { ...sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'REAL'), icmsSituacaoTributaria: '41' },
        unidades: [unidade('a', 1, 'FONE-01')],
        notasVenda: venda,
      }),
    );
    expect(real.itens[0]).not.toHaveProperty('tributos');
    const simples = montarNotaDevolucaoPura(entrada({ unidades: [unidade('a', 1, 'FONE-01')], notasVenda: venda }));
    expect(simples.itens[0]).not.toHaveProperty('tributos');
  });

  it('várias NF de venda (vários pedidos): referencia as duas; comprador contribuinte não é consumidor final', () => {
    const pj = { ...DESTINATARIO_TESTE, cpf: null, cnpj: '19131243000197', ie: '123456789', indicadorIe: 1 as const };
    const nota = montarNotaDevolucaoPura(
      entrada({
        unidades: [unidade('a', 1, 'FONE-01'), unidade('b', 2, 'CABO-02')],
        notasVenda: [
          notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01' })], pj),
          notaVenda(NV_B, CHAVE_B, [itemVenda({ numero: 1, codigo: 'CABO-02' })], pj),
        ],
      }),
    );
    expect(nota.chavesReferenciadas).toEqual([CHAVE_A, CHAVE_B]);
    expect(nota.consumidorFinal).toBe(false);
  });

  it('recusa com a mensagem do que falta', () => {
    expect(() => montarNotaDevolucaoPura(entrada({ notasVenda: [] }))).toThrow(
      'Falta a NF de venda: anexe o XML (baixado do Bitbrain) ou busque no Mercado Livre.',
    );
    expect(() => montarNotaDevolucaoPura(entrada({ unidades: [] }))).toThrow('Nenhum item da devolução está aguardando NF.');
    expect(() => montarNotaDevolucaoPura(entrada({ unidades: [unidade('x', 4, 'SEM-PAR')] }))).toThrow(
      'Unidade 4 (SKU SEM-PAR): escolha o item da NF de venda.',
    );
    const outroComprador = { ...DESTINATARIO_TESTE, cpf: '11144477735' };
    expect(() =>
      montarNotaDevolucaoPura(
        entrada({
          notasVenda: [
            notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', quantidade: 2 })]),
            notaVenda(NV_B, CHAVE_B, [itemVenda({ numero: 1, codigo: 'CABO-02' })], outroComprador),
          ],
        }),
      ),
    ).toThrow('As NF de venda anexadas têm destinatários diferentes: remova a que não é desta devolução.');
    expect(() =>
      montarNotaDevolucaoPura(
        entrada({ unidades: [unidade('a', 1, 'FONE-01')], notasVenda: [notaVenda(NV_A, CHAVE_A, [itemVenda({ numero: 1, codigo: 'FONE-01', ncm: '' })])] }),
      ),
    ).toThrow('O item 1 da NF de venda (FONE-01) não tem NCM válido.');
  });

  it('informações complementares: {chaves}, {devolucao} e {seriais}', () => {
    expect(preencherInformacoes('S/N: {seriais}. Ref. {chaves}. {devolucao}', { chaves: [CHAVE_A], devolucao: 'DEV-000001', seriais: ['SN1', 'SN2'] })).toBe(
      `S/N: SN1, SN2. Ref. ${CHAVE_A}. DEV-000001`,
    );
    expect(preencherInformacoes('S/N: {seriais}', { chaves: [], devolucao: 'DEV-1', seriais: [] })).toBe('S/N: sem S/N');
    expect(preencherInformacoes(null, { chaves: [CHAVE_A], devolucao: 'DEV-1', seriais: [] })).toBe(`Devolucao referente a NF-e ${CHAVE_A}. Devolucao DEV-1.`);
  });
});
