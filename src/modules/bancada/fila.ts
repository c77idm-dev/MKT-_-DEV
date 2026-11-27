import { and, asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, retiradasFull } from '@/db/schema';
import { buscarDevolucoes, type ResumoDevolucao } from '@/modules/devolucoes/busca';
import type { DadosSelo } from '@/modules/devolucoes/selos';
import { ordemDaEtapa } from '@/modules/devolucoes/quadro';
import { SELO_URGENTE } from '@/modules/mercado-livre/dominio';

/**
 * (E29) Quantas devoluções da lista "Esperando conferência" a Bancada mostra; o total vem à parte. A lista é a da etapa 2,
 * que pode ser longa (o ML manda de volta os pacotes do armazém de uma vez); o resto fica na ordem, para depois.
 */
export const LIMITE_ESPERANDO = 50;

/** Um cartão da fila da Bancada. `titulo`: o produto da unidade 1 (ou o aviso de pacote não identificado). */
export type CartaoFila = {
  id: string;
  codigo: string;
  titulo: string;
  chegouEm: Date | null;
  urgenteML: boolean;
  /** Pacote não identificado: o Gestor liga ao pedido antes da conferência (não tem "Conferir"). */
  naoIdentificada: boolean;
  /** Foto do anúncio do ML do produto da unidade 1 (produtos do ML, extra). */
  foto: string | null;
  selos: DadosSelo[];
};

export type RetiradaFila = { id: string; codigo: string; codigoEtiqueta: string; abertaEm: Date };

export type FilaBancada = { esperando: CartaoFila[]; totalEsperando: number; continuar: CartaoFila[]; retiradas: RetiradaFila[] };

function cartao(d: ResumoDevolucao): CartaoFila {
  const outras = d.unidades - 1;
  const produto = d.produto ? `${d.produto}${outras > 0 ? ` + ${outras} ${outras === 1 ? 'unidade' : 'unidades'}` : ''}` : null;
  return {
    id: d.id,
    codigo: d.codigo,
    titulo: d.naoIdentificada ? 'Pacote não identificado' : (produto ?? 'Sem itens cadastrados'),
    chegouEm: d.recebidaEm,
    urgenteML: d.selos.some((s) => s.texto.startsWith(SELO_URGENTE)),
    naoIdentificada: d.naoIdentificada,
    foto: d.fotoProduto ?? null,
    selos: d.selos,
  };
}

/**
 * (E29) A fila da Bancada do Operador:
 * - `esperando`: AGUARDANDO_CONFERENCIA, na ordem da etapa 2 do quadro (as urgentes do ML primeiro, depois quem chegou antes);
 * - `continuar`: EM_CONFERENCIA travadas com a pessoa (a do colega não aparece);
 * - `retiradas`: as retiradas do Full ABERTAS, as mais antigas primeiro.
 */
export async function listarFilaBancada(db: DbOuTx, usuarioId: string, agora: Date = new Date()): Promise<FilaBancada> {
  const minhas = await db
    .select({ id: devolucoes.id })
    .from(devolucoes)
    .where(and(eq(devolucoes.status, 'EM_CONFERENCIA'), eq(devolucoes.conferenteId, usuarioId)));
  const [esperando, continuar, retiradas] = await Promise.all([
    buscarDevolucoes(db, {}, { status: ['AGUARDANDO_CONFERENCIA'], ...ordemDaEtapa(2), porPagina: LIMITE_ESPERANDO, agora }),
    buscarDevolucoes(db, {}, { status: ['EM_CONFERENCIA'], ids: minhas.map((m) => m.id), ...ordemDaEtapa(2), porPagina: LIMITE_ESPERANDO, agora }),
    db
      .select({ id: retiradasFull.id, codigo: retiradasFull.codigo, codigoEtiqueta: retiradasFull.codigoEtiqueta, abertaEm: retiradasFull.recebidaEm })
      .from(retiradasFull)
      .where(eq(retiradasFull.situacao, 'ABERTA'))
      .orderBy(asc(retiradasFull.recebidaEm), asc(retiradasFull.numero)),
  ]);
  return {
    esperando: esperando.devolucoes.map(cartao),
    totalEsperando: esperando.total,
    continuar: continuar.devolucoes.map(cartao),
    retiradas,
  };
}
