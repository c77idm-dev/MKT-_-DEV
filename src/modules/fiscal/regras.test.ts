import { describe, expect, it } from 'vitest';
import { OPERACOES_FISCAIS, TIPOS_NOTA } from './dominio';
import { conferirIcmsComRegime, rotuloRegra, sugestaoDeRegra, validarRegra, type EntradaRegra } from './regras';

const ENTRADA: EntradaRegra = { cfop: '1202', icms: '900', pis: '98', cofins: '98', natureza: '  Devolucao   de venda ', informacoes: '' };

describe('sugestões das regras (spec §8.3; o contador valida)', () => {
  it('devolução de venda: 1202 dentro e 2202 fora; CSOSN no Simples e CST no Presumido e no Real', () => {
    expect(sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES')).toEqual({
      tipoNota: 'DEVOLUCAO_VENDA',
      operacao: 'DENTRO_ESTADO',
      cfop: '1202',
      icmsSituacaoTributaria: '900',
      pisSituacaoTributaria: '98',
      cofinsSituacaoTributaria: '98',
      naturezaOperacao: 'Devolucao de venda',
      informacoesComplementares: 'Devolucao referente a NF-e {chaves}. Devolucao {devolucao}.',
    });
    expect(sugestaoDeRegra('DEVOLUCAO_VENDA', 'FORA_ESTADO', 'PRESUMIDO')).toMatchObject({ cfop: '2202', icmsSituacaoTributaria: '00' });
    expect(sugestaoDeRegra('REMESSA_CONSERTO', 'FORA_ESTADO', 'REAL')).toMatchObject({ cfop: '6915', icmsSituacaoTributaria: '41', pisSituacaoTributaria: '49' });
    expect(sugestaoDeRegra('REMESSA_TROCA_GARANTIA', 'DENTRO_ESTADO', 'SIMPLES')).toMatchObject({ cfop: '5949', icmsSituacaoTributaria: '400' });
  });

  it('toda sugestão passa na própria validação, em todo regime', () => {
    for (const regime of ['SIMPLES', 'PRESUMIDO', 'REAL'] as const) {
      for (const tipo of TIPOS_NOTA) {
        for (const operacao of OPERACOES_FISCAIS) {
          const s = sugestaoDeRegra(tipo, operacao, regime);
          const entrada = {
            cfop: s.cfop,
            icms: s.icmsSituacaoTributaria,
            pis: s.pisSituacaoTributaria,
            cofins: s.cofinsSituacaoTributaria,
            natureza: s.naturezaOperacao,
            informacoes: s.informacoesComplementares ?? '',
          };
          expect(validarRegra(tipo, operacao, entrada, regime).erros, `${tipo} ${operacao} ${regime}`).toEqual([]);
        }
      }
    }
  });

  it('rótulo da combinação (mensagem "Falta a regra fiscal", spec §8.2)', () => {
    expect(rotuloRegra('REMESSA_CONSERTO', 'FORA_ESTADO')).toBe('Remessa para conserto, fora do estado');
  });
});

describe('validarRegra', () => {
  it('normaliza a natureza e deixa as informações vazias como null', () => {
    expect(validarRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', ENTRADA, 'SIMPLES').dados).toMatchObject({
      naturezaOperacao: 'Devolucao de venda',
      informacoesComplementares: null,
    });
  });

  it('o CFOP precisa combinar com a nota (entrada 1/2, saída 5/6) e com a operação', () => {
    expect(validarRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', { ...ENTRADA, cfop: '5202' }, 'SIMPLES').erros).toEqual([
      'O CFOP 5202 não serve para Devolução de venda, dentro do estado: use um CFOP que começa com 1',
    ]);
    expect(validarRegra('REMESSA_CONSERTO', 'FORA_ESTADO', { ...ENTRADA, cfop: '5915', pis: '49', cofins: '49' }, 'SIMPLES').erros).toEqual([
      'O CFOP 5915 não serve para Remessa para conserto, fora do estado: use um CFOP que começa com 6',
    ]);
    expect(validarRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', { ...ENTRADA, cfop: '12' }, 'SIMPLES').erros).toEqual(['CFOP: use 4 números']);
  });

  it('CSOSN no Simples, CST no Presumido e no Real (spec §8.2); PIS, COFINS e natureza', () => {
    const { dados, erros } = validarRegra(
      'DEVOLUCAO_VENDA',
      'DENTRO_ESTADO',
      { ...ENTRADA, icms: '102', pis: '1', cofins: '', natureza: 'x'.repeat(61) },
      'PRESUMIDO',
    );
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'No Lucro Presumido o ICMS usa CST (00, 02, 10, 15, 20, 30, 40, 41, 50, 51, 53, 60, 61, 70, 90), não 102.',
      'CST do PIS inválido: 1',
      'CST do COFINS inválido: (vazio)',
      'Natureza da operação: no máximo 60 caracteres',
    ]);
  });

  it('conferirIcmsComRegime', () => {
    expect(conferirIcmsComRegime('900', 'SIMPLES')).toBeNull();
    expect(conferirIcmsComRegime('00', 'SIMPLES')).toBe('No Simples Nacional o ICMS usa CSOSN (101, 102, 103, 201, 202, 203, 300, 400, 500, 900), não 00.');
    expect(conferirIcmsComRegime('41', 'REAL')).toBeNull();
  });
});
