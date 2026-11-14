import { describe, expect, it } from 'vitest';
import type { ConfiguracaoFiscal, RegraFiscal } from '@/modules/fiscal/configuracao';
import { montarNotaRemessaPura, preencherInformacoesRemessa, type EntradaRemessa, type UnidadeRemessa } from './montar-remessa';

const CONFIG: ConfiguracaoFiscal = {
  emitente: { razaoSocial: 'Empresa Teste Ltda', cnpj: '11444777000161', ie: '110042490114', logradouro: 'Rua A', numero: '100', complemento: null, bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', cep: '01001000' },
  regime: 'SIMPLES',
  serie: '1',
  ambiente: 'HOMOLOGACAO',
};
const REGRA: RegraFiscal = {
  tipoNota: 'REMESSA_CONSERTO',
  operacao: 'FORA_ESTADO',
  cfop: '6915',
  icmsSituacaoTributaria: '400',
  pisSituacaoTributaria: '49',
  cofinsSituacaoTributaria: '49',
  naturezaOperacao: 'Remessa para conserto',
  informacoesComplementares: 'Lote {lote}. S/N: {seriais}.',
};
const FORNECEDOR = {
  razaoSocial: 'Fornecedor Remessa Ltda',
  cnpj: '11222333000181',
  ie: '0623079040081',
  logradouro: 'Rua das Peças',
  numero: '200',
  complemento: null,
  bairro: 'Distrito Industrial',
  cidade: 'Contagem',
  uf: 'MG',
  cep: '32210000',
};
function unidade(n: number, p: Partial<UnidadeRemessa> = {}): UnidadeRemessa {
  return {
    itemId: `item-${n}`, unidade: 1, devolucaoCodigo: `DEV-00000${n}`, produtoId: 'p1', sku: 'FONE-01', descricao: 'Fone Bluetooth',
    ean: '7891000000014', ncm: '85183000', custo: '35.90', unidadeMedida: 'UN', serial: `SN${n}`, ...p,
  };
}
function entrada(p: Partial<EntradaRemessa> = {}): EntradaRemessa {
  return { referencia: 'ref1', loteCodigo: 'LOT-000045', tipo: 'CONSERTO', config: CONFIG, regra: REGRA, fornecedor: FORNECEDOR, unidades: [unidade(1)], ...p };
}

describe('NF de remessa (spec §8.5, decisão 6)', () => {
  it('um item por produto, com a quantidade de unidades, NCM e o custo do produto como valor', () => {
    const nota = montarNotaRemessaPura(
      entrada({ unidades: [unidade(1), unidade(2), unidade(3, { produtoId: 'p2', sku: 'CABO-02', descricao: 'Cabo USB', ncm: '85444200', custo: '9.50', ean: null, unidadeMedida: null, serial: null })] }),
    );
    expect(nota.itens).toEqual([
      { codigo: 'FONE-01', descricao: 'Fone Bluetooth', ncm: '85183000', cfop: '6915', unidade: 'UN', quantidade: 2, valorUnitario: 35.9, ean: '7891000000014', icmsOrigem: 0, icmsSituacao: '400', pisSituacao: '49', cofinsSituacao: '49' },
      { codigo: 'CABO-02', descricao: 'Cabo USB', ncm: '85444200', cfop: '6915', unidade: 'UN', quantidade: 1, valorUnitario: 9.5, ean: null, icmsOrigem: 0, icmsSituacao: '400', pisSituacao: '49', cofinsSituacao: '49' },
    ]);
  });

  it('saída normal, sem nota referenciada, para o fornecedor com IE', () => {
    const nota = montarNotaRemessaPura(entrada());
    expect(nota).toMatchObject({
      referencia: 'ref1', tipo: 'REMESSA_CONSERTO', naturezaOperacao: 'Remessa para conserto', entrada: false, finalidade: 'NORMAL',
      operacao: 'FORA_ESTADO', consumidorFinal: false, regime: 'SIMPLES', chavesReferenciadas: [],
      emitente: CONFIG.emitente,
      destinatario: { nome: 'Fornecedor Remessa Ltda', cpf: null, cnpj: '11222333000181', ie: '0623079040081', indicadorIe: 1, uf: 'MG', cep: '32210000' },
    });
  });

  it('fornecedor sem IE: indicador 9 e consumidor final; troca/garantia vira REMESSA_TROCA_GARANTIA', () => {
    const nota = montarNotaRemessaPura(entrada({ tipo: 'GARANTIA', fornecedor: { ...FORNECEDOR, ie: null } }));
    expect(nota).toMatchObject({ tipo: 'REMESSA_TROCA_GARANTIA', consumidorFinal: true, destinatario: { indicadorIe: 9, ie: null } });
  });

  it('informações complementares: o código do lote e a lista de S/N (spec §8.5)', () => {
    expect(montarNotaRemessaPura(entrada({ unidades: [unidade(1), unidade(2, { serial: null })] })).informacoesComplementares).toBe('Lote LOT-000045. S/N: SN1.');
    expect(preencherInformacoesRemessa(null, { lote: 'LOT-000001', seriais: [], devolucoes: ['DEV-000001', 'DEV-000002'] })).toBe('Lote LOT-000001. S/N: sem S/N.');
    expect(preencherInformacoesRemessa('Devolucoes {devolucao}. {chaves}Lote {lote}', { lote: 'LOT-000001', seriais: ['A'], devolucoes: ['DEV-000001', 'DEV-000002'] })).toBe(
      'Devolucoes DEV-000001, DEV-000002. Lote LOT-000001',
    );
  });

  it('recusa com tudo o que falta, numa mensagem só', () => {
    const e = entrada({
      fornecedor: { ...FORNECEDOR, cep: null, cidade: null },
      unidades: [unidade(1, { ncm: null }), unidade(2, { produtoId: 'p2', sku: 'CABO-02', custo: '0' })],
    });
    expect(() => montarNotaRemessaPura(e)).toThrow(
      'Complete o cadastro do fornecedor Fornecedor Remessa Ltda em Produtos e Fornecedores (falta: cidade, CEP). Produto FONE-01: falta o NCM. Produto CABO-02: falta o custo.',
    );
    expect(() => montarNotaRemessaPura(entrada({ unidades: [] }))).toThrow('O lote LOT-000045 não tem unidades.');
  });

  // Spec §12: "montagem dos dados das NF (devolução e remessa) para cada regime".
  it.each([
    ['SIMPLES', '400'],
    ['PRESUMIDO', '41'],
    ['REAL', '41'],
  ] as const)('regime %s: a nota leva o regime e o ICMS da regra (%s), sem tributos', (regime, icms) => {
    const nota = montarNotaRemessaPura(entrada({ config: { ...CONFIG, regime }, regra: { ...REGRA, icmsSituacaoTributaria: icms } }));
    expect(nota.regime).toBe(regime);
    expect(nota.itens.map((i) => i.icmsSituacao)).toEqual([icms]);
    expect(nota.itens.every((i) => i.tributos === undefined)).toBe(true);
  });

  it('S/N demais para as informações complementares: resume em vez de cortar; sem como resumir, recusa', () => {
    const muitas = Array.from({ length: 400 }, (_, n) => unidade(n, { serial: `SERIAL-MUITO-COMPRIDO-${n}` }));
    expect(montarNotaRemessaPura(entrada({ unidades: muitas })).informacoesComplementares).toBe(
      'Lote LOT-000045. S/N: 400 unidades; S/N na lista consolidada do lote LOT-000045.',
    );
    expect(() => montarNotaRemessaPura(entrada({ regra: { ...REGRA, informacoesComplementares: 'X'.repeat(5001) } }))).toThrow(
      'As informações complementares da regra fiscal passam de 5000 caracteres: encurte o modelo em Configurações › Fiscal.',
    );
  });
});
