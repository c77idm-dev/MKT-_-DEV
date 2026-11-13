import { describe, expect, it } from 'vitest';
import { operacaoPorUf, validarDadosEmpresa, validarTrocaAmbiente, type EntradaEmpresa } from './configuracao';

const OK: EntradaEmpresa = {
  razao_social: ' Empresa  Teste Ltda ',
  cnpj: '11.444.777/0001-61',
  ie: '110.042.490.114',
  cep: '01001-000',
  logradouro: 'Rua A',
  numero: '100',
  complemento: '',
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'sp',
  regime: 'SIMPLES',
  serie: '002',
};

describe('validarDadosEmpresa', () => {
  it('normaliza CNPJ, IE, CEP, UF e série', () => {
    expect(validarDadosEmpresa(OK)).toEqual({
      dados: {
        razaoSocial: 'Empresa Teste Ltda',
        cnpj: '11444777000161',
        ie: '110042490114',
        logradouro: 'Rua A',
        numero: '100',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01001000',
        regime: 'SIMPLES',
        serie: '2',
      },
      erros: [],
    });
  });

  it('junta os erros na ordem do formulário', () => {
    const { dados, erros } = validarDadosEmpresa({
      ...OK,
      razao_social: '',
      cnpj: '11.444.777/0001-62',
      ie: 'ABC',
      cep: '123',
      logradouro: '',
      uf: 'XX',
      regime: '',
      serie: '900',
    });
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'Informe a razão social',
      'CNPJ inválido',
      'Inscrição estadual inválida: use só os números',
      'CEP inválido',
      'Informe o logradouro',
      'Escolha a UF',
      'Escolha o regime tributário',
      'Série da NF-e inválida: use um número de 0 a 889',
    ]);
  });

  it('limita os textos a 60 caracteres (limite da NF-e)', () => {
    expect(validarDadosEmpresa({ ...OK, bairro: 'x'.repeat(61) }).erros).toEqual(['Bairro: no máximo 60 caracteres']);
  });
});

describe('validarTrocaAmbiente', () => {
  const focusSemProducao = { simulado: false, tokenHomologacao: true, tokenProducao: false };

  it('homologação sempre pode', () => {
    expect(validarTrocaAmbiente({ ambiente: 'HOMOLOGACAO', confirmado: false, emissor: focusSemProducao })).toEqual({ ambiente: 'HOMOLOGACAO', erros: [] });
  });

  it('produção exige a confirmação do contador e, com a Focus de verdade, o token de produção', () => {
    expect(validarTrocaAmbiente({ ambiente: 'PRODUCAO', confirmado: false, emissor: focusSemProducao }).erros).toEqual([
      'Para passar para produção, confirme que o contador validou as regras e as notas de homologação.',
      'Falta o token de produção da Focus NFe (FOCUS_TOKEN_PRODUCAO) no .env do servidor.',
    ]);
    expect(validarTrocaAmbiente({ ambiente: 'PRODUCAO', confirmado: true, emissor: { ...focusSemProducao, tokenProducao: true } })).toEqual({
      ambiente: 'PRODUCAO',
      erros: [],
    });
  });

  it('com o emissor simulado, basta a confirmação; ambiente desconhecido é recusado', () => {
    const simulado = { simulado: true, tokenHomologacao: false, tokenProducao: false };
    expect(validarTrocaAmbiente({ ambiente: 'PRODUCAO', confirmado: true, emissor: simulado }).erros).toEqual([]);
    expect(validarTrocaAmbiente({ ambiente: 'TESTE', confirmado: true, emissor: simulado }).erros).toEqual(['Escolha o ambiente da NF-e']);
  });
});

describe('operacaoPorUf (spec §8.4)', () => {
  it('mesma UF é dentro do estado; outra UF, fora', () => {
    expect(operacaoPorUf('SP', ' sp ')).toBe('DENTRO_ESTADO');
    expect(operacaoPorUf('SP', 'RJ')).toBe('FORA_ESTADO');
  });
});
