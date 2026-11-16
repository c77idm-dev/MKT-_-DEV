import { formatarDataHora, formatarDataIso } from '@/lib/formatar';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { interpretarData } from '@/lib/valores';
import { ROTULO_STATUS_ITEM, type StatusItem } from '@/modules/devolucoes/dominio';

/**
 * Melhoria 4: planilha "Volta ao armazém". O que foi para o Estoque Bom no período (unidades de devolução BOM depois da
 * conferência e itens das retiradas do Full conferidas), para lançar à mão no AnyMarket e no ERP. Não depende da NF.
 */

/** A ordem das colunas da spec (melhoria 4, item 3). */
export const COLUNAS_VOLTA = ['Data', 'Origem', 'SKU', 'Descrição', 'EAN', 'Quantidade', 'Situação', 'Nº de série'] as const;

/** Período máximo por planilha, contando o primeiro e o último dia. */
export const DIAS_MAXIMOS_PLANILHA = 366;
/** (extra) A página mostra no máximo isto de cartões; a planilha traz tudo. */
export const CARTOES_MAXIMOS = 200;
export const MENSAGEM_PERIODO_INVALIDO = `Período inválido: escolha "De" antes de "Até", com no máximo ${DIAS_MAXIMOS_PLANILHA} dias.`;
export const SITUACAO_RETIRADA = 'Retirada do Full';
export const NOME_ABA = 'Volta ao armazém';

/** Datas no formato AAAA-MM-DD. */
export type Periodo = { de: string; ate: string };

export type LinhaVolta = {
  /** Única na lista (id da unidade ou do item da retirada). */
  chave: string;
  tipo: 'DEVOLUCAO' | 'RETIRADA';
  /** Conclusão da conferência da devolução, ou da retirada. */
  data: Date;
  /** DEV-000123 ou RF-000001. */
  origem: string;
  sku: string;
  descricao: string;
  ean: string | null;
  quantidade: number;
  situacao: string;
  /** Só na devolução. */
  serial: string | null;
};

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const UM_DIA = 86_400_000;

export function hojeEmBrasilia(agora: Date = new Date()): string {
  return DIA.format(agora);
}

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * UM_DIA).toISOString().slice(0, 10);
}

export function validarPeriodoVolta(de: string, ate: string): boolean {
  // interpretarData devolve sempre AAAA-MM-DD: a igualdade recusa datas que não existem e o formato dd/mm/aaaa.
  if (interpretarData(de) !== de || interpretarData(ate) !== ate) return false;
  const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / UM_DIA;
  return dias >= 0 && dias < DIAS_MAXIMOS_PLANILHA;
}

/** O período da URL (?de=&ate=). Sem um dos dois, vale hoje (horário de Brasília). */
export function lerPeriodo(parametros: ParametrosBusca, agora: Date = new Date()): Periodo & { valido: boolean } {
  const hoje = hojeEmBrasilia(agora);
  const de = primeiroValor(parametros.de) || hoje;
  const ate = primeiroValor(parametros.ate) || hoje;
  return { de, ate, valido: validarPeriodoVolta(de, ate) };
}

export type RotuloAtalho = 'Hoje' | 'Últimos 7 dias' | 'Este mês';

export function atalhosDoPeriodo(agora: Date = new Date()): { rotulo: RotuloAtalho; de: string; ate: string }[] {
  const hoje = hojeEmBrasilia(agora);
  return [
    { rotulo: 'Hoje', de: hoje, ate: hoje },
    { rotulo: 'Últimos 7 dias', de: somarDias(hoje, -6), ate: hoje },
    { rotulo: 'Este mês', de: `${hoje.slice(0, 8)}01`, ate: hoje },
  ];
}

/** O atalho do período, se houver. Só o primeiro que casa (no dia 1, "Hoje" e não "Este mês"). */
export function atalhoAtivo(p: Periodo, agora: Date = new Date()): RotuloAtalho | null {
  return atalhosDoPeriodo(agora).find((a) => a.de === p.de && a.ate === p.ate)?.rotulo ?? null;
}

/** "Aguardando NF", "Disponível para venda" e, para os outros status, o rótulo do próprio status. */
export function situacaoDaUnidade(status: StatusItem): string {
  return ROTULO_STATUS_ITEM[status];
}

export function hrefDaOrigem(l: Pick<LinhaVolta, 'tipo' | 'origem'>): string {
  return l.tipo === 'DEVOLUCAO' ? `/fluxo/devolucoes/${l.origem}` : `/fluxo/retiradas-full/${l.origem}`;
}

export function nomeArquivoVolta(p: Periodo): string {
  return `volta-ao-armazem_${p.de}_a_${p.ate}.xlsx`;
}

export function textoPeriodo(p: Periodo): string {
  return `${formatarDataIso(p.de)} a ${formatarDataIso(p.ate)}`;
}

type Celula = string | number | null;

/** Título, o período, uma linha vazia, as colunas e uma linha por unidade ou item. */
export function planilhaVolta(p: Periodo, linhas: LinhaVolta[]): Celula[][] {
  return [
    [NOME_ABA],
    ['Período', textoPeriodo(p)],
    [],
    [...COLUNAS_VOLTA],
    ...linhas.map((l): Celula[] => [
      formatarDataHora(l.data),
      l.origem,
      l.sku || null,
      l.descricao,
      l.ean || null,
      l.quantidade,
      l.situacao,
      l.serial || null,
    ]),
  ];
}
