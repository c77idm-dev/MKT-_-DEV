import { and, asc, count, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, lotes, notasFiscais, produtos } from '@/db/schema';
import { formatarDataHora } from '@/lib/formatar';
import { primeiroValor, type ParametrosBusca } from '@/lib/parametros';
import { ehUuid } from '@/lib/uuid';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { ROTULO_MOTIVO, ROTULO_STATUS_ITEM, type StatusItem } from '@/modules/devolucoes/dominio';
import { CARTOES_POR_COLUNA } from '@/modules/devolucoes/quadro';
import type { TomSelo } from '@/modules/devolucoes/selos';
import { SELO_SITUACAO_NOTA } from '@/modules/fiscal/dominio';
import { vistaDaNota, type VistaNota } from '@/modules/fiscal/situacao';
import { listarEventos, rotuloDaAcao } from '@/modules/historico/eventos';
import {
  ehStatusLote,
  ROTULO_RESULTADO,
  ROTULO_STATUS_LOTE,
  ROTULO_TIPO_LOTE,
  STATUS_LOTE,
  TOM_STATUS_LOTE,
  type StatusLote,
  type TipoLote,
} from './dominio';
import { loteEditavel, notaAtivaDoLote } from './repositorio';

export const LOTES_POR_PAGINA = 20;
const BUSCA_MAXIMA = 60;
const VAZIO = '—';

export type FiltrosLotes = { fornecedorId?: string; status?: StatusLote; busca?: string };

/** Spec §6.5 (por fornecedor e por status) e §6.7 (busca). Valor inválido some, como nas outras listas. */
export function lerFiltrosLotes(p: ParametrosBusca): FiltrosLotes {
  const filtros: FiltrosLotes = {};
  const fornecedor = primeiroValor(p.fornecedor);
  if (ehUuid(fornecedor)) filtros.fornecedorId = fornecedor;
  const status = primeiroValor(p.status);
  if (ehStatusLote(status)) filtros.status = status;
  const busca = primeiroValor(p.busca).slice(0, BUSCA_MAXIMA).trim();
  if (busca) filtros.busca = busca;
  return filtros;
}

export function hrefDaPaginaLotes(base: string, filtros: FiltrosLotes, pagina: number): string {
  const q = new URLSearchParams();
  if (filtros.fornecedorId) q.set('fornecedor', filtros.fornecedorId);
  if (filtros.status) q.set('status', filtros.status);
  if (filtros.busca) q.set('busca', filtros.busca);
  if (pagina > 1) q.set('pagina', String(pagina));
  const texto = q.toString();
  return texto ? `${base}?${texto}` : base;
}

export type CartaoLoteVista = {
  id: string;
  codigo: string;
  fornecedor: string;
  status: StatusLote;
  rotuloStatus: string;
  tom: TomSelo;
  tipo: string | null;
  unidades: number;
  seloNota: { texto: string; tom: TomSelo } | null;
};

const SQL_UNIDADES = sql<number>`(select count(*)::int from "itens_devolucao" where "itens_devolucao"."lote_id" = "lotes"."id")`;
const SQL_NOTA_RECENTE = sql<string | null>`(select "notas_fiscais"."situacao"::text from "notas_fiscais" where "notas_fiscais"."lote_id" = "lotes"."id" and "notas_fiscais"."situacao" <> 'CANCELADA' order by "notas_fiscais"."criada_em" desc limit 1)`;
const SQL_ORDEM_STATUS = sql`array_position(array[${sql.join(
  STATUS_LOTE.map((s) => sql`${s}`),
  sql`, `,
)}]::status_lote[], ${lotes.status})`;

function seloDaNota(situacao: string | null): CartaoLoteVista['seloNota'] {
  if (situacao === 'PROCESSANDO') return { texto: SELO_SITUACAO_NOTA.PROCESSANDO, tom: 'destaque' };
  if (situacao === 'REJEITADA') return { texto: SELO_SITUACAO_NOTA.REJEITADA, tom: 'erro' };
  return null;
}

function padraoLike(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function condicoes(filtros: FiltrosLotes, soAtivos: boolean): SQL {
  const partes: (SQL | undefined)[] = [
    // Decisão 3: lote sem unidade só aparece enquanto está ABERTO.
    sql`(${lotes.status} = 'ABERTO' or exists (select 1 from "itens_devolucao" where "itens_devolucao"."lote_id" = ${lotes.id}))`,
    soAtivos ? ne(lotes.status, 'FINALIZADO') : undefined,
    filtros.fornecedorId ? eq(lotes.fornecedorId, filtros.fornecedorId) : undefined,
    filtros.status ? eq(lotes.status, filtros.status) : undefined,
  ];
  if (filtros.busca) {
    const like = padraoLike(filtros.busca);
    partes.push(sql`(
      ${lotes.codigo} ilike ${like} or ${lotes.rastreioEnvio} ilike ${like}
      or exists (
        select 1 from "itens_devolucao" "i" inner join "devolucoes" "d" on "d"."id" = "i"."devolucao_id"
        where "i"."lote_id" = ${lotes.id}
          and ("d"."codigo" ilike ${like} or "i"."serial" ilike ${like} or "i"."sku" ilike ${like} or "i"."ean_lido" ilike ${like})
      )
    )`);
  }
  return and(...partes) as SQL;
}

export async function listarLotes(
  db: DbOuTx,
  filtros: FiltrosLotes,
  opcoes: { pagina?: number; porPagina?: number; soAtivos?: boolean } = {},
): Promise<{ lotes: CartaoLoteVista[]; total: number }> {
  const pagina = opcoes.pagina ?? 1;
  const porPagina = opcoes.porPagina ?? LOTES_POR_PAGINA;
  const onde = condicoes(filtros, opcoes.soAtivos ?? false);
  const linhas = await db
    .select({
      id: lotes.id,
      codigo: lotes.codigo,
      fornecedor: fornecedores.razaoSocial,
      status: lotes.status,
      tipo: lotes.tipo,
      unidades: SQL_UNIDADES,
      situacaoNota: SQL_NOTA_RECENTE,
    })
    .from(lotes)
    .innerJoin(fornecedores, eq(fornecedores.id, lotes.fornecedorId))
    .where(onde)
    .orderBy(asc(SQL_ORDEM_STATUS), desc(lotes.criadoEm), desc(lotes.numero))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  const [{ total }] = await db.select({ total: count() }).from(lotes).where(onde);
  return {
    total,
    lotes: linhas.map((l) => ({
      id: l.id,
      codigo: l.codigo,
      fornecedor: l.fornecedor,
      status: l.status,
      rotuloStatus: ROTULO_STATUS_LOTE[l.status],
      tom: TOM_STATUS_LOTE[l.status],
      tipo: l.tipo ? ROTULO_TIPO_LOTE[l.tipo] : null,
      unidades: l.unidades,
      seloNota: seloDaNota(l.situacaoNota),
    })),
  };
}

/** Fornecedores que têm lote (para o filtro da lista). */
export async function opcoesFornecedoresDosLotes(db: DbOuTx): Promise<{ id: string; razaoSocial: string }[]> {
  return db
    .selectDistinct({ id: fornecedores.id, razaoSocial: fornecedores.razaoSocial })
    .from(lotes)
    .innerJoin(fornecedores, eq(fornecedores.id, lotes.fornecedorId))
    .orderBy(asc(fornecedores.razaoSocial));
}

export type UnidadeSemFornecedorVista = {
  itemId: string;
  devolucaoCodigo: string;
  unidade: number;
  sku: string;
  descricao: string;
  motivo: string;
  serial: string;
  skuSugerido: string;
};

export async function listarSemFornecedor(db: DbOuTx, opcoes: { limite?: number } = {}): Promise<{ unidades: UnidadeSemFornecedorVista[]; total: number }> {
  const recebido = alias(produtos, 'produto_recebido');
  const esperado = alias(produtos, 'produto_esperado');
  const onde = eq(itensDevolucao.status, 'SEM_FORNECEDOR');
  const [{ total }] = await db.select({ total: count() }).from(itensDevolucao).where(onde);
  if (opcoes.limite === 0) return { unidades: [], total };
  const consulta = db
    .select({
      item: itensDevolucao,
      devolucaoCodigo: devolucoes.codigo,
      skuRecebido: recebido.sku,
      descricaoRecebido: recebido.descricao,
      descricaoEsperado: esperado.descricao,
    })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .leftJoin(recebido, eq(recebido.id, itensDevolucao.produtoRecebidoId))
    .leftJoin(esperado, eq(esperado.id, itensDevolucao.produtoEsperadoId))
    .where(onde)
    .orderBy(asc(itensDevolucao.criadoEm), asc(devolucoes.codigo), asc(itensDevolucao.unidade));
  const linhas = await (opcoes.limite === undefined ? consulta : consulta.limit(opcoes.limite));
  return {
    total,
    unidades: linhas.map((l) => ({
      itemId: l.item.id,
      devolucaoCodigo: l.devolucaoCodigo,
      unidade: l.item.unidade,
      sku: l.item.sku,
      descricao: l.descricaoRecebido ?? l.descricaoEsperado ?? VAZIO,
      motivo: l.item.motivo ? ROTULO_MOTIVO[l.item.motivo] : VAZIO,
      serial: l.item.serial ?? VAZIO,
      skuSugerido: l.skuRecebido ?? l.item.sku,
    })),
  };
}

export type UnidadeLoteVista = {
  itemId: string;
  devolucaoCodigo: string;
  unidade: number;
  sku: string;
  descricao: string;
  serial: string;
  motivo: string;
  observacao: string | null;
  status: StatusItem;
  rotuloStatus: string;
  resultado: string | null;
};

export type DetalheLote = {
  id: string;
  codigo: string;
  status: StatusLote;
  rotuloStatus: string;
  tom: TomSelo;
  tipo: TipoLote | null;
  rotuloTipo: string | null;
  fornecedor: { razaoSocial: string; cnpj: string; uf: string | null; contatoSac: string | null; emailSac: string | null };
  rastreioEnvio: string | null;
  datas: { criado: string; fechado: string | null; enviado: string | null; finalizado: string | null };
  unidades: UnidadeLoteVista[];
  nota: VistaNota | null;
  anteriores: VistaNota[];
  editavel: boolean;
  destinos: { valor: string; rotulo: string }[];
  outroAberto: string | null;
  temLista: boolean;
  historico: { id: number; texto: string; em: string; quem: string }[];
};

export async function obterDetalheLote(db: DbOuTx, codigo: string, agora: Date = new Date()): Promise<DetalheLote | null> {
  const [achado] = await db
    .select({ lote: lotes, fornecedor: fornecedores })
    .from(lotes)
    .innerJoin(fornecedores, eq(fornecedores.id, lotes.fornecedorId))
    .where(eq(lotes.codigo, codigo));
  if (!achado) return null;
  const { lote, fornecedor } = achado;
  const config = await lerConfiguracao(db);

  const recebido = alias(produtos, 'produto_recebido');
  const esperado = alias(produtos, 'produto_esperado');
  const linhasUnidades = await db
    .select({ item: itensDevolucao, devolucaoCodigo: devolucoes.codigo, descricaoRecebido: recebido.descricao, descricaoEsperado: esperado.descricao })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .leftJoin(recebido, eq(recebido.id, itensDevolucao.produtoRecebidoId))
    .leftJoin(esperado, eq(esperado.id, itensDevolucao.produtoEsperadoId))
    .where(eq(itensDevolucao.loteId, lote.id))
    .orderBy(asc(devolucoes.codigo), asc(itensDevolucao.unidade));

  const notas = await db.select().from(notasFiscais).where(eq(notasFiscais.loteId, lote.id)).orderBy(desc(notasFiscais.criadaEm));
  const notaAtiva = notas.find((n) => n.situacao !== 'CANCELADA') ?? null;
  const editavel = loteEditavel(lote.status, notaAtiva);

  const destinos: { valor: string; rotulo: string }[] = [];
  if (editavel) {
    const candidatos = await db
      .select({ id: lotes.id, codigo: lotes.codigo, status: lotes.status, unidades: SQL_UNIDADES })
      .from(lotes)
      .where(and(eq(lotes.fornecedorId, lote.fornecedorId), ne(lotes.id, lote.id), inArray(lotes.status, ['ABERTO', 'FECHADO'])))
      .orderBy(asc(lotes.numero));
    for (const c of candidatos) {
      if (c.status !== 'ABERTO' && c.unidades === 0) continue;
      if (!loteEditavel(c.status, c.status === 'FECHADO' ? await notaAtivaDoLote(db, c.id) : null)) continue;
      destinos.push({ valor: c.id, rotulo: `${c.codigo} (${ROTULO_STATUS_LOTE[c.status]})` });
    }
  }
  let outroAberto: string | null = null;
  if (lote.status !== 'ABERTO') {
    const [aberto] = await db
      .select({ codigo: lotes.codigo })
      .from(lotes)
      .where(and(eq(lotes.fornecedorId, lote.fornecedorId), eq(lotes.status, 'ABERTO')));
    outroAberto = aberto?.codigo ?? null;
  }

  // Decisão 18: o histórico do lote inclui os eventos das NF de remessa dele.
  const eventos = [
    ...(await listarEventos(db, 'lote', lote.id)),
    ...(await Promise.all(notas.map((n) => listarEventos(db, 'nota_fiscal', n.id)))).flat(),
  ].sort((a, b) => a.id - b.id);

  const serie = config.serieNfe ?? null;
  const notaLigada = lote.notaFiscalId ? notas.find((n) => n.id === lote.notaFiscalId) : undefined;
  return {
    id: lote.id,
    codigo: lote.codigo,
    status: lote.status,
    rotuloStatus: ROTULO_STATUS_LOTE[lote.status],
    tom: TOM_STATUS_LOTE[lote.status],
    tipo: lote.tipo,
    rotuloTipo: lote.tipo ? ROTULO_TIPO_LOTE[lote.tipo] : null,
    fornecedor: { razaoSocial: fornecedor.razaoSocial, cnpj: fornecedor.cnpj, uf: fornecedor.uf, contatoSac: fornecedor.contatoSac, emailSac: fornecedor.emailSac },
    rastreioEnvio: lote.rastreioEnvio,
    datas: {
      criado: formatarDataHora(lote.criadoEm),
      fechado: lote.fechadoEm ? formatarDataHora(lote.fechadoEm) : null,
      enviado: lote.enviadoEm ? formatarDataHora(lote.enviadoEm) : null,
      finalizado: lote.finalizadoEm ? formatarDataHora(lote.finalizadoEm) : null,
    },
    unidades: linhasUnidades.map((l) => ({
      itemId: l.item.id,
      devolucaoCodigo: l.devolucaoCodigo,
      unidade: l.item.unidade,
      sku: l.item.sku,
      descricao: l.descricaoRecebido ?? l.descricaoEsperado ?? VAZIO,
      serial: l.item.serial ?? VAZIO,
      motivo: l.item.motivo ? ROTULO_MOTIVO[l.item.motivo] : VAZIO,
      observacao: l.item.observacao,
      status: l.item.status,
      rotuloStatus: ROTULO_STATUS_ITEM[l.item.status],
      resultado: l.item.resultadoFornecedor ? ROTULO_RESULTADO[l.item.resultadoFornecedor] : null,
    })),
    nota: notaAtiva ? vistaDaNota(notaAtiva, serie, agora) : null,
    anteriores: notas.filter((n) => n.situacao === 'CANCELADA').map((n) => vistaDaNota(n, serie, agora)),
    editavel,
    destinos,
    outroAberto,
    temLista: notaLigada?.situacao === 'AUTORIZADA',
    historico: eventos.map((e) => ({ id: e.id, texto: rotuloDaAcao(e.acao), em: formatarDataHora(e.em), quem: e.usuarioNome ?? 'Sistema' })),
  };
}

/** Coluna 5 do quadro: lotes que ainda não foram finalizados. */
export async function resumoLotesQuadro(db: DbOuTx): Promise<{ total: number; cartoes: CartaoLoteVista[] }> {
  const { lotes: cartoes, total } = await listarLotes(db, {}, { soAtivos: true, porPagina: CARTOES_POR_COLUNA });
  return { total, cartoes };
}

export type UnidadeDaDevolucaoVista = {
  unidade: number;
  sku: string;
  rotuloStatus: string;
  lote: { codigo: string; rotuloStatus: string; tom: TomSelo } | null;
  resultado: string | null;
};

/** Seção Lote da devolução: onde está cada unidade que seguiu para o fornecedor. */
export async function unidadesDaDevolucaoNosLotes(db: DbOuTx, devolucaoId: string): Promise<UnidadeDaDevolucaoVista[]> {
  const linhas = await db
    .select({ item: itensDevolucao, loteCodigo: lotes.codigo, loteStatus: lotes.status })
    .from(itensDevolucao)
    .leftJoin(lotes, eq(lotes.id, itensDevolucao.loteId))
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), inArray(itensDevolucao.status, ['EM_LOTE', 'ENVIADO', 'RESOLVIDO', 'SEM_FORNECEDOR'])))
    .orderBy(asc(itensDevolucao.unidade));
  return linhas.map((l) => ({
    unidade: l.item.unidade,
    sku: l.item.sku,
    rotuloStatus: ROTULO_STATUS_ITEM[l.item.status],
    lote: l.loteCodigo && l.loteStatus ? { codigo: l.loteCodigo, rotuloStatus: ROTULO_STATUS_LOTE[l.loteStatus], tom: TOM_STATUS_LOTE[l.loteStatus] } : null,
    resultado: l.item.resultadoFornecedor ? ROTULO_RESULTADO[l.item.resultadoFornecedor] : null,
  }));
}
