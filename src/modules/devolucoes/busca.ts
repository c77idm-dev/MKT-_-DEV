import { and, asc, count, desc, eq, exists, ilike, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, produtos } from '@/db/schema';
import { escaparLike } from '@/lib/texto';
import { somenteDigitos } from '@/modules/catalogo/documentos';
import type { DestinoEstoque, SituacaoNotaFiscal } from '@/modules/fiscal/dominio';
import type { Canal, StatusDevolucao } from './dominio';
import { POR_PAGINA_DEVOLUCOES, type FiltrosBusca } from './filtros';
import { normalizarRastreio } from './rastreio';
import { selosDaDevolucao, type DadosSelo } from './selos';

export type ResumoDevolucao = {
  id: string;
  codigo: string;
  canal: Canal | null;
  status: StatusDevolucao;
  rastreio: string | null;
  pedidos: string[];
  /** Descrição do produto da unidade 1 (ou o SKU, se estiver fora do cadastro). */
  produto: string | null;
  unidades: number;
  naoIdentificada: boolean;
  criadaEm: Date;
  recebidaEm: Date | null;
  selos: DadosSelo[];
  /** Unidades em AGUARDANDO_NF por destino (spec §6.4); zero fora da etapa 4. */
  destinos?: { bom: number; problema: number };
  /** A NF de devolução que não está cancelada (null = nenhuma). */
  situacaoNota?: SituacaoNotaFiscal | null;
};

export type OpcoesBusca = {
  /** Status da etapa da lista. Sem isso, busca em todos. */
  status?: readonly StatusDevolucao[];
  /** "recentes": "Entregue (ML)" no topo e depois as mais novas (spec §5.2). "chegada": quem chegou primeiro. */
  ordem?: 'recentes' | 'chegada';
  pagina?: number;
  porPagina?: number;
  agora?: Date;
  /** Etapa 4: só as devoluções com unidade AGUARDANDO_NF neste destino (abas Estoque Bom e Estoque Problema). */
  destino?: DestinoEstoque;
};

function condicoes(db: DbOuTx, f: FiltrosBusca): SQL[] {
  const lista: SQL[] = [];
  if (f.rastreio) lista.push(ilike(devolucoes.rastreio, `%${escaparLike(normalizarRastreio(f.rastreio))}%`));
  if (f.pedido) lista.push(sql`array_to_string(${devolucoes.pedidosExternos}, ' ') ilike ${`%${escaparLike(f.pedido.trim())}%`}`);
  if (f.reclamacao) lista.push(ilike(devolucoes.reclamacaoId, `%${escaparLike(f.reclamacao.trim())}%`));
  if (f.canal) lista.push(eq(devolucoes.canal, f.canal));
  if (f.status) lista.push(eq(devolucoes.status, f.status));
  if (f.de) lista.push(sql`${devolucoes.criadaEm} >= (${f.de}::date::timestamp at time zone 'America/Sao_Paulo')`);
  if (f.ate) lista.push(sql`${devolucoes.criadaEm} < ((${f.ate}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`);
  if (f.fornecedor) {
    const termo = `%${escaparLike(f.fornecedor.trim())}%`;
    const documento = f.fornecedor.toUpperCase().replace(/[^0-9A-Z]/g, '');
    lista.push(
      exists(
        db
          .select({ um: sql`1` })
          .from(itensDevolucao)
          .innerJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
          .innerJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
          .where(
            and(
              eq(itensDevolucao.devolucaoId, devolucoes.id),
              or(ilike(fornecedores.razaoSocial, termo), documento ? like(fornecedores.cnpj, `${documento}%`) : undefined),
            ),
          ),
      ),
    );
  }
  if (f.codigo) {
    const codigo = f.codigo.trim();
    const ean = /^[0-9]+$/.test(codigo) ? somenteDigitos(codigo) : '';
    lista.push(
      exists(
        db
          .select({ um: sql`1` })
          .from(itensDevolucao)
          .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
          .where(
            and(
              eq(itensDevolucao.devolucaoId, devolucoes.id),
              or(
                ean ? eq(produtos.ean, ean) : undefined,
                sql`upper(${itensDevolucao.serial}) = upper(${codigo})`,
                sql`upper(${itensDevolucao.eanLido}) = upper(${codigo})`,
                sql`upper(${itensDevolucao.sku}) = upper(${codigo})`,
              ),
            ),
          ),
      ),
    );
  }
  return lista;
}

export async function buscarDevolucoes(
  db: DbOuTx,
  filtros: FiltrosBusca,
  opcoes: OpcoesBusca = {},
): Promise<{ devolucoes: ResumoDevolucao[]; total: number }> {
  const porPagina = opcoes.porPagina ?? POR_PAGINA_DEVOLUCOES;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const lista = condicoes(db, filtros);
  if (opcoes.status) lista.push(opcoes.status.length > 0 ? inArray(devolucoes.status, [...opcoes.status]) : sql`false`);
  if (opcoes.destino) {
    lista.push(
      sql`exists (select 1 from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = ${opcoes.destino}::destino_item)`,
    );
  }
  const onde = lista.length > 0 ? and(...lista) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(devolucoes).where(onde);
  const ordem =
    opcoes.ordem === 'chegada'
      ? [asc(devolucoes.recebidaEm), asc(devolucoes.numero)]
      : [sql`${devolucoes.entregueSegundoCanalEm} is null`, desc(devolucoes.numero)];

  const linhas = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      canal: devolucoes.canal,
      status: devolucoes.status,
      rastreio: devolucoes.rastreio,
      pedidos: devolucoes.pedidosExternos,
      naoIdentificada: devolucoes.naoIdentificada,
      criadaEm: devolucoes.criadaEm,
      recebidaEm: devolucoes.recebidaEm,
      entregueSegundoCanalEm: devolucoes.entregueSegundoCanalEm,
      prazoConferenciaCanal: devolucoes.prazoConferenciaCanal,
      // Colunas qualificadas à mão: o drizzle omite o nome da tabela nas subconsultas correlacionadas e o "id" ficaria ambíguo.
      produto: sql<string | null>`(
        select coalesce("produtos"."descricao", "itens_devolucao"."sku")
        from "itens_devolucao"
        left join "produtos" on "produtos"."id" = "itens_devolucao"."produto_esperado_id"
        where "itens_devolucao"."devolucao_id" = "devolucoes"."id"
        order by "itens_devolucao"."unidade"
        limit 1
      )`,
      unidades: sql<number>`(select count(*) from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id")::int`,
      estoqueBom: sql<number>`(select count(*) from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = 'BOM')::int`,
      estoqueProblema: sql<number>`(select count(*) from "itens_devolucao" where "itens_devolucao"."devolucao_id" = "devolucoes"."id" and "itens_devolucao"."status" = 'AGUARDANDO_NF' and "itens_devolucao"."destino" = 'PROBLEMA')::int`,
      situacaoNota: sql<SituacaoNotaFiscal | null>`(select "notas_fiscais"."situacao" from "notas_fiscais" where "notas_fiscais"."devolucao_id" = "devolucoes"."id" and "notas_fiscais"."situacao" <> 'CANCELADA' limit 1)`,
    })
    .from(devolucoes)
    .where(onde)
    .orderBy(...ordem)
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  const agora = opcoes.agora ?? new Date();
  return {
    total,
    devolucoes: linhas.map(({ entregueSegundoCanalEm, prazoConferenciaCanal, estoqueBom, estoqueProblema, ...resto }) => ({
      ...resto,
      destinos: { bom: estoqueBom, problema: estoqueProblema },
      selos: selosDaDevolucao(
        {
          canal: resto.canal,
          status: resto.status,
          naoIdentificada: resto.naoIdentificada,
          entregueSegundoCanalEm,
          prazoConferenciaCanal,
          situacaoNota: resto.situacaoNota,
        },
        agora,
      ),
    })),
  };
}
