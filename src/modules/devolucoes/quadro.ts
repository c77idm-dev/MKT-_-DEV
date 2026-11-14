import { eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes } from '@/db/schema';
import type { DestinoEstoque } from '@/modules/fiscal/dominio';
import { buscarDevolucoes, type ResumoDevolucao } from './busca';
import { statusDaEtapa } from './dominio';
import { ETAPAS } from './etapas';

export const CARTOES_POR_COLUNA = 5;

/** Nota da etapa 5 (mesmo texto da página /fluxo/etapa/5): os lotes por fornecedor chegam numa fase posterior. */
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
      const status = statusDaEtapa(etapa.numero);
      if (status.length === 0) return { numero: etapa.numero, titulo: etapa.titulo, total: 0, cartoes: [], href };
      const { devolucoes: cartoes, total } = await buscarDevolucoes(
        db,
        {},
        { status, ordem: etapa.numero === 2 ? 'chegada' : 'recentes', porPagina: CARTOES_POR_COLUNA, agora },
      );
      const coluna: ColunaQuadro = { numero: etapa.numero, titulo: etapa.titulo, total, cartoes, href };
      return etapa.numero === 4 ? { ...coluna, estoque: await contarEstoque(db) } : coluna;
    }),
  );
}
