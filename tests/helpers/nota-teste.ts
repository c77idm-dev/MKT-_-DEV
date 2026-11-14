import type { DadosEmitente, Destinatario, NotaParaEmissao } from '@/conectores/nfe/tipos';

/** Nota de devolução de exemplo para os testes do emissor (a mesma empresa de EMPRESA_TESTE). */
export const EMITENTE_TESTE: DadosEmitente = {
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
};

export const DESTINATARIO_TESTE: Destinatario = {
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
};

/** Chave válida (dígito confere) de uma NF de venda da EMPRESA_TESTE. */
export const CHAVE_VENDA_TESTE = '35261011444777000161550010000001011000001012';

export function notaTeste(dados: Partial<NotaParaEmissao> = {}): NotaParaEmissao {
  return {
    referencia: '0b9f1c2e3d4a4b5c8d6e7f8091a2b3c4',
    tipo: 'DEVOLUCAO_VENDA',
    naturezaOperacao: 'Devolucao de venda',
    entrada: true,
    finalidade: 'DEVOLUCAO',
    operacao: 'DENTRO_ESTADO',
    consumidorFinal: true,
    regime: 'SIMPLES',
    emitente: EMITENTE_TESTE,
    destinatario: DESTINATARIO_TESTE,
    chavesReferenciadas: [CHAVE_VENDA_TESTE],
    itens: [
      {
        codigo: 'FONE-01',
        descricao: 'Fone Bluetooth',
        ncm: '85183000',
        cfop: '1202',
        unidade: 'UN',
        quantidade: 2,
        valorUnitario: 99.95,
        ean: '7891234567895',
        icmsOrigem: 0,
        icmsSituacao: '900',
        pisSituacao: '98',
        cofinsSituacao: '98',
      },
    ],
    informacoesComplementares: `Devolucao referente a NF-e ${CHAVE_VENDA_TESTE}. Devolucao DEV-000001.`,
    ...dados,
  };
}
