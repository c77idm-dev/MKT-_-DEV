import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ErroEmissorIndisponivel } from './erros';
import type { NotaParaEmissao, SituacaoNota } from './tipos';

/**
 * Tradução entre a NotaParaEmissao e a API da Focus NFe (pesquisa focus-nfe.md §2 a §4). Funções puras: na "Ligação das
 * contas reais" (contrato §9) só este arquivo muda se a homologação mostrar outro formato.
 */

/** Em homologação a SEFAZ exige este nome no destinatário (rejeição 598). */
export const NOME_HOMOLOGACAO = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
const REGIME_FOCUS = { SIMPLES: 1, PRESUMIDO: 3, REAL: 3 } as const;
/** status_sefaz de uso denegado (a Focus não tem o status "denegado"; decisão 16). */
const CODIGOS_DENEGADA = new Set(['110', '301', '302', '303']);

export type RespostaFocus = {
  status?: string;
  status_sefaz?: string | number;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string | number;
  serie?: string | number;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  caminho_xml_cancelamento?: string;
  codigo?: string;
  mensagem?: string;
  erros?: { campo?: string; mensagem?: string }[];
};

export function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

/** "2026-11-12T10:00:00-03:00": horário de Brasília (sem horário de verão desde 2019). */
export function dataFocus(data: Date): string {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

type Payload = Record<string, unknown>;

/** Tira os campos vazios: a Focus trata "" e null como "informado". */
function semVazios(objeto: Payload): Payload {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== null && valor !== undefined && valor !== ''));
}

export function montarPayloadFocus(nota: NotaParaEmissao, opcoes: { ambiente: AmbienteNfe; emitidaEm: Date }): Payload {
  const items = nota.itens.map((item, i) => {
    const t = item.tributos ?? {};
    return semVazios({
      numero_item: i + 1,
      codigo_produto: item.codigo,
      descricao: item.descricao.slice(0, 120),
      codigo_ncm: item.ncm,
      cfop: item.cfop,
      unidade_comercial: item.unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valorUnitario,
      unidade_tributavel: item.unidade,
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: item.valorUnitario,
      valor_bruto: arredondar(item.quantidade * item.valorUnitario),
      codigo_barras_comercial: item.ean ?? 'SEM GTIN',
      codigo_barras_tributavel: item.ean ?? 'SEM GTIN',
      inclui_no_total: 1,
      icms_origem: item.icmsOrigem,
      icms_situacao_tributaria: item.icmsSituacao,
      icms_modalidade_base_calculo: t.icmsBase !== undefined ? 3 : undefined,
      icms_base_calculo: t.icmsBase,
      icms_aliquota: t.icmsAliquota,
      icms_valor: t.icmsValor,
      pis_situacao_tributaria: item.pisSituacao,
      pis_base_calculo: t.pisBase,
      pis_aliquota_porcentual: t.pisAliquota,
      pis_valor: t.pisValor,
      cofins_situacao_tributaria: item.cofinsSituacao,
      cofins_base_calculo: t.cofinsBase,
      cofins_aliquota_porcentual: t.cofinsAliquota,
      cofins_valor: t.cofinsValor,
    });
  });
  const valorProdutos = arredondar(items.reduce((soma, item) => soma + Number(item.valor_bruto), 0));
  const e = nota.emitente;
  const d = nota.destinatario;
  const data = dataFocus(opcoes.emitidaEm);
  return semVazios({
    natureza_operacao: nota.naturezaOperacao.slice(0, 60),
    data_emissao: data,
    data_entrada_saida: data,
    tipo_documento: nota.entrada ? 0 : 1,
    finalidade_emissao: nota.finalidade === 'DEVOLUCAO' ? 4 : 1,
    local_destino: nota.operacao === 'DENTRO_ESTADO' ? 1 : 2,
    consumidor_final: nota.consumidorFinal ? 1 : 0,
    presenca_comprador: 0,
    modalidade_frete: 9,
    regime_tributario_emitente: REGIME_FOCUS[nota.regime],
    cnpj_emitente: e.cnpj,
    inscricao_estadual_emitente: e.ie,
    nome_emitente: e.razaoSocial,
    logradouro_emitente: e.logradouro,
    numero_emitente: e.numero,
    complemento_emitente: e.complemento,
    bairro_emitente: e.bairro,
    municipio_emitente: e.cidade,
    uf_emitente: e.uf,
    cep_emitente: e.cep,
    nome_destinatario: opcoes.ambiente === 'HOMOLOGACAO' ? NOME_HOMOLOGACAO : d.nome.slice(0, 60),
    cpf_destinatario: d.cpf,
    cnpj_destinatario: d.cpf ? null : d.cnpj,
    indicador_inscricao_estadual_destinatario: d.indicadorIe,
    inscricao_estadual_destinatario: d.indicadorIe === 1 ? d.ie : null,
    logradouro_destinatario: d.logradouro,
    numero_destinatario: d.numero,
    complemento_destinatario: d.complemento,
    bairro_destinatario: d.bairro,
    municipio_destinatario: d.cidade,
    uf_destinatario: d.uf,
    cep_destinatario: d.cep,
    notas_referenciadas: nota.chavesReferenciadas.length > 0 ? nota.chavesReferenciadas.map((chave) => ({ chave_nfe: chave })) : null,
    informacoes_adicionais_contribuinte: nota.informacoesComplementares,
    valor_produtos: valorProdutos,
    valor_total: valorProdutos,
    items,
  });
}

function motivoDaResposta(r: RespostaFocus): string {
  const erros = (r.erros ?? []).map((e) => [e.campo, e.mensagem].filter(Boolean).join(': ')).filter(Boolean);
  return r.mensagem_sefaz?.trim() || erros.join('; ') || r.mensagem?.trim() || 'Rejeitada sem motivo informado';
}

export function interpretarConsultaFocus(json: unknown): SituacaoNota {
  const r = (json ?? {}) as RespostaFocus;
  switch (r.status) {
    case 'processando_autorizacao':
      return { situacao: 'PROCESSANDO' };
    case 'autorizado':
      if (!r.chave_nfe || !r.caminho_xml_nota_fiscal || !r.caminho_danfe) {
        throw new ErroEmissorIndisponivel('A Focus NFe respondeu "autorizado" sem a chave ou sem os arquivos: a consulta será repetida.');
      }
      return {
        situacao: 'AUTORIZADA',
        chave: r.chave_nfe.replace(/^NFe/i, ''),
        numero: String(r.numero ?? ''),
        serie: String(r.serie ?? ''),
        urlXml: r.caminho_xml_nota_fiscal,
        urlDanfe: r.caminho_danfe,
      };
    case 'erro_autorizacao': {
      const codigo = r.status_sefaz === undefined ? null : String(r.status_sefaz);
      const motivo = motivoDaResposta(r);
      return { situacao: 'REJEITADA', codigo, motivo: codigo && CODIGOS_DENEGADA.has(codigo) ? `NF denegada pela SEFAZ: ${motivo}` : motivo };
    }
    case 'cancelado':
      return { situacao: 'CANCELADA', urlXmlCancelamento: r.caminho_xml_cancelamento ?? null };
    default:
      throw new ErroEmissorIndisponivel(`Situação desconhecida da Focus NFe: ${String(r.status)}`);
  }
}

export function interpretarCancelamentoFocus(json: unknown): SituacaoNota {
  const r = (json ?? {}) as RespostaFocus;
  if (r.status === 'cancelado') return { situacao: 'CANCELADA', urlXmlCancelamento: r.caminho_xml_cancelamento ?? null };
  if (r.status === 'erro_cancelamento') return { situacao: 'CANCELAMENTO_RECUSADO', motivo: motivoDaResposta(r) };
  throw new ErroEmissorIndisponivel(`Resposta desconhecida da Focus NFe ao cancelar: ${String(r.status)}`);
}
