import { eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { DestinoEstoque } from '@/modules/fiscal/dominio';
import { resumoLotesQuadro, type CartaoLoteVista } from '@/modules/lotes/consultas';
import { buscarDevolucoes, type OpcoesBusca, type ResumoDevolucao } from './busca';
import { statusDaEtapa } from './dominio';
import { ETAPAS } from './etapas';

export const CARTOES_POR_COLUNA = 5;

/**
 * A ordem da lista de cada etapa: "recentes" (spec §5.2), menos a etapa 2, por quem chegou primeiro; nas etapas 2 e 3, as
 * urgentes do ML primeiro (extra). A Bancada do Operador (E29) usa a da etapa 2.
 */
export function ordemDaEtapa(numero: number): Pick<OpcoesBusca, 'ordem' | 'urgentesPrimeiro'> {
  return { ordem: numero === 2 ? 'chegada' : 'recentes', urgentesPrimeiro: numero === 2 || numero === 3 };
}

/** Nota da etapa 5 que a página /fluxo/etapa/[numero] (congelada) ainda importa. */
export const NOTA_ETAPA_LOTES = 'Os lotes por fornecedor aparecem aqui quando a conferência estiver pronta.';

/** Devoluções em AGUARDANDO_NF com alguma unidade em cada destino (spec §6.4, D16). A mesma pode contar nas duas. */
export type ContagemEstoque = { bom: number; problema: number };

export type ColunaQuadro = {
  numero: number;
  titulo: string;
  total: number;
  cartoes: ResumoDevolucao[];
  href: string;
  /** Só na coluna 4: a divisão Estoque Bom / Estoque Problema. */
  estoque?: ContagemEstoque;
  /** Só na coluna 5: os lotes por fornecedor ainda não finalizados (decisão 15). */
  lotes?: CartaoLoteVista[];
};

function temNoDestino(destino: DestinoEstoque) {
  return sql`exists (select 1 from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = ${destino}::destino_item)`;
}

export async function contarEstoque(db: DbOuTx): Promise<ContagemEstoque> {
  const [linha] = await db
    .select({
      bom: sql<number>`(count(*) filter (where ${temNoDestino('BOM')}))::int`,
      problema: sql<number>`(count(*) filter (where ${temNoDestino('PROBLEMA')}))::int`,
    })
    .from(devolucoes)
    .where(eq(devolucoes.status, 'AGUARDANDO_NF'));
  return { bom: linha?.bom ?? 0, problema: linha?.problema ?? 0 };
}

/** Uma coluna por etapa do PDF (spec §6.0), com o total e os primeiros cartões. A coluna 4 traz a divisão do estoque. */
export async function montarQuadro(db: DbOuTx, agora: Date = new Date()): Promise<ColunaQuadro[]> {
  return Promise.all(
    ETAPAS.map(async (etapa): Promise<ColunaQuadro> => {
      const href = `/fluxo/etapa/${etapa.numero}`;
      if (etapa.numero === 5) {
        const resumo = await resumoLotesQuadro(db);
        return { numero: etapa.numero, titulo: etapa.titulo, total: resumo.total, cartoes: [], href, lotes: resumo.cartoes };
      }
      const status = statusDaEtapa(etapa.numero);
      if (status.length === 0) return { numero: etapa.numero, titulo: etapa.titulo, total: 0, cartoes: [], href };
      const { devolucoes: cartoes, total } = await buscarDevolucoes(
        db,
        {},
        { status, ...ordemDaEtapa(etapa.numero), porPagina: CARTOES_POR_COLUNA, agora },
      );
      const coluna: ColunaQuadro = { numero: etapa.numero, titulo: etapa.titulo, total, cartoes, href };
      return etapa.numero === 4 ? { ...coluna, estoque: await contarEstoque(db) } : coluna;
    }),
  );
}
