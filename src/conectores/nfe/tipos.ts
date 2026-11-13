import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import type { OperacaoFiscal, TipoNota } from '@/modules/fiscal/dominio';

/** Resposta do emissor (contrato §5.7). `motivo` é o texto da SEFAZ, em português. */
export type SituacaoNota =
  | { situacao: 'PROCESSANDO' }
  | { situacao: 'AUTORIZADA'; chave: string; numero: string; serie: string; urlXml: string; urlDanfe: string }
  | { situacao: 'REJEITADA'; codigo: string | null; motivo: string }
  | { situacao: 'CANCELADA'; urlXmlCancelamento: string | null }
  /** A nota continua AUTORIZADA. */
  | { situacao: 'CANCELAMENTO_RECUSADO'; motivo: string };

/** Spec §4.3 (emitir, consultar, cancelar) mais `baixar` (XML e DANFE). O núcleo só fala com o emissor por aqui. */
export interface EmissorNFe {
  emitir(nota: NotaParaEmissao): Promise<{ referencia: string }>;
  consultar(referencia: string): Promise<SituacaoNota>;
  /** Justificativa de 15 a 255 caracteres. */
  cancelar(referencia: string, justificativa: string): Promise<SituacaoNota>;
  baixar(url: string): Promise<Buffer>;
}

export type NotaParaEmissao = {
  referencia: string;
  tipo: TipoNota;
  naturezaOperacao: string;
  /** Devolução de venda: true (tipo_documento 0). */
  entrada: boolean;
  finalidade: 'NORMAL' | 'DEVOLUCAO';
  operacao: OperacaoFiscal;
  consumidorFinal: boolean;
  regime: RegimeTributario;
  emitente: DadosEmitente;
  destinatario: Destinatario;
  /** 44 dígitos, sem o prefixo "NFe". */
  chavesReferenciadas: string[];
  itens: ItemNota[];
  informacoesComplementares: string | null;
};

export type DadosEmitente = {
  razaoSocial: string;
  cnpj: string;
  ie: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type Destinatario = {
  nome: string;
  cpf: string | null;
  cnpj: string | null;
  ie: string | null;
  indicadorIe: 1 | 2 | 9;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type ItemNota = {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  ean: string | null;
  icmsOrigem: number;
  icmsSituacao: string;
  pisSituacao: string;
  cofinsSituacao: string;
  tributos?: {
    icmsBase?: number;
    icmsAliquota?: number;
    icmsValor?: number;
    pisBase?: number;
    pisAliquota?: number;
    pisValor?: number;
    cofinsBase?: number;
    cofinsAliquota?: number;
    cofinsValor?: number;
  };
};
