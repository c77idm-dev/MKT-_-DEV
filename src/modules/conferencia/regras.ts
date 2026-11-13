/**
 * Regras puras da conferência. Também rodam no celular (a tela mostra o que falta antes de pedir a conclusão),
 * então este arquivo só importa vocabulário (dominio.ts), nunca o banco.
 */
import { MOTIVOS_ITEM, type DestinoItem, type MotivoItem } from '@/modules/devolucoes/dominio';

/** Estoque Bom, Estoque Problema ou ausente (contrato D4: ausente não tem destino, só o motivo AUSENTE). */
export const DECISOES = ['BOM', 'PROBLEMA', 'AUSENTE'] as const;
export type Decisao = (typeof DECISOES)[number];

export const MOTIVOS_PROBLEMA = MOTIVOS_ITEM.filter((m) => m !== 'AUSENTE');

export function decisaoDoItem(destino: DestinoItem | null, motivo: MotivoItem | null): Decisao | null {
  if (destino) return destino;
  return motivo === 'AUSENTE' ? 'AUSENTE' : null;
}

export function colunasDaDecisao(
  decisao: Decisao | null,
  motivo: MotivoItem | null,
): { destino: DestinoItem | null; motivo: MotivoItem | null } | { erro: string } {
  switch (decisao) {
    case 'BOM':
      return { destino: 'BOM', motivo: null };
    case 'PROBLEMA':
      if (!motivo || motivo === 'AUSENTE') return { erro: 'Escolha o motivo do Estoque Problema.' };
      return { destino: 'PROBLEMA', motivo };
    case 'AUSENTE':
      return { destino: null, motivo: 'AUSENTE' };
    default:
      return { destino: null, motivo: null };
  }
}

/** O que o celular manda de cada unidade (tudo junto: o último estado da tela vence). */
export type EntradaItem = {
  serial: string;
  loteFabricacao: string;
  validade: string;
  decisao: Decisao | null;
  motivo: MotivoItem | null;
  observacao: string;
};

export type ColunasItem = {
  serial: string | null;
  loteFabricacao: string | null;
  validade: string | null;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};

export function entradaDoItem(i: ColunasItem): EntradaItem {
  return {
    serial: i.serial ?? '',
    loteFabricacao: i.loteFabricacao ?? '',
    validade: i.validade ?? '',
    decisao: decisaoDoItem(i.destino, i.motivo),
    motivo: i.motivo,
    observacao: i.observacao ?? '',
  };
}

export function validarItem(e: EntradaItem): { colunas: ColunasItem | null; erros: string[] } {
  const erros: string[] = [];
  const texto = (valor: string, maximo: number, nome: string): string | null => {
    const limpo = valor.trim();
    if (limpo.length > maximo) erros.push(`${nome}: no máximo ${maximo} caracteres`);
    return limpo || null;
  };
  const serial = texto(e.serial, 100, 'Nº de série (S/N)');
  const loteFabricacao = texto(e.loteFabricacao, 60, 'Lote');
  const validade = texto(e.validade, 20, 'Validade');
  const observacao = texto(e.observacao, 500, 'Observação');
  const decisao = colunasDaDecisao(e.decisao, e.motivo);
  if ('erro' in decisao) erros.push(decisao.erro);
  if (erros.length > 0 || 'erro' in decisao) return { colunas: null, erros };
  return { colunas: { serial, loteFabricacao, validade, destino: decisao.destino, motivo: decisao.motivo, observacao }, erros: [] };
}

/** "0036000291452" e "036000291452" são o mesmo GTIN (UPC-A lido como EAN-13). */
export function semZerosAEsquerda(codigo: string): string {
  return codigo.replace(/^0+(?=\d)/, '');
}

export type ResultadoComparacao = {
  situacao: 'confere' | 'diverge' | 'sem_referencia';
  produtoRecebidoId: string | null;
  sugerirMotivo: 'DIVERGENTE' | null;
};

/** Contrato §5.6: o produto recebido é o esperado quando o EAN confere; o achado pelo EAN quando diverge; vazio se desconhecido. */
export function compararEan(p: {
  esperado: { id: string; ean: string | null } | null;
  lido: string;
  achado: { id: string } | null;
}): ResultadoComparacao {
  if (p.esperado?.ean) {
    if (semZerosAEsquerda(p.esperado.ean) === semZerosAEsquerda(p.lido)) {
      return { situacao: 'confere', produtoRecebidoId: p.esperado.id, sugerirMotivo: null };
    }
    return { situacao: 'diverge', produtoRecebidoId: p.achado?.id ?? null, sugerirMotivo: 'DIVERGENTE' };
  }
  if (p.achado && p.esperado && p.achado.id !== p.esperado.id) {
    return { situacao: 'diverge', produtoRecebidoId: p.achado.id, sugerirMotivo: 'DIVERGENTE' };
  }
  return { situacao: 'sem_referencia', produtoRecebidoId: p.achado?.id ?? p.esperado?.id ?? null, sugerirMotivo: null };
}
