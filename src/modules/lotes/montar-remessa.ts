import { and, asc, eq, ne } from 'drizzle-orm';
import type { Destinatario, ItemNota, NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, lotes, notasFiscais, produtos } from '@/db/schema';
import { lerConfiguracaoFiscal, operacaoPorUf, regraFiscal, type ConfiguracaoFiscal, type RegraFiscal } from '@/modules/fiscal/configuracao';
import { ROTULO_SITUACAO_NOTA } from '@/modules/fiscal/dominio';
import { ROTULO_STATUS_LOTE, tipoNotaDoLote, type StatusLote, type TipoLote } from './dominio';
import { ErroLotes } from './erros';

/** Limite das informações complementares da NF-e (decisão 6: nunca cortar em silêncio). */
export const INFORMACOES_MAXIMAS_NFE = 5000;
const MODELO_PADRAO = 'Lote {lote}. S/N: {seriais}.';

export type FornecedorRemessa = {
  razaoSocial: string;
  cnpj: string;
  ie: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

export type UnidadeRemessa = {
  itemId: string;
  unidade: number;
  devolucaoCodigo: string;
  produtoId: string | null;
  sku: string;
  descricao: string | null;
  ean: string | null;
  ncm: string | null;
  custo: string | null;
  unidadeMedida: string | null;
  serial: string | null;
};

export type EntradaRemessa = {
  referencia: string;
  loteCodigo: string;
  tipo: TipoLote;
  config: ConfiguracaoFiscal;
  regra: RegraFiscal;
  fornecedor: FornecedorRemessa;
  unidades: UnidadeRemessa[];
};

const vazio = (v: string | null): boolean => !v || v.trim() === '';

/** Os campos do endereço que a NF exige, na ordem da tela de fornecedores. */
export function faltasDoFornecedor(f: FornecedorRemessa): string[] {
  const campos: [string, string | null][] = [
    ['logradouro', f.logradouro],
    ['número', f.numero],
    ['bairro', f.bairro],
    ['cidade', f.cidade],
    ['UF', f.uf],
    ['CEP', f.cep],
  ];
  return campos.filter(([, v]) => vazio(v)).map(([rotulo]) => rotulo);
}

function preencher(modelo: string, v: { lote: string; seriais: string; devolucoes: string[] }): string {
  return modelo
    .replaceAll('{lote}', v.lote)
    .replaceAll('{seriais}', v.seriais)
    .replaceAll('{devolucao}', [...new Set(v.devolucoes)].join(', '))
    .replaceAll('{chaves}', '')
    .trim();
}

/** Modelo da regra: {lote}, {seriais}, {devolucao} e {chaves} (vazio). Nunca corta: resume os S/N ou recusa. */
export function preencherInformacoesRemessa(modelo: string | null, v: { lote: string; seriais: string[]; devolucoes: string[] }): string {
  const base = modelo ?? MODELO_PADRAO;
  const completo = preencher(base, { lote: v.lote, seriais: v.seriais.length > 0 ? v.seriais.join(', ') : 'sem S/N', devolucoes: v.devolucoes });
  if (completo.length <= INFORMACOES_MAXIMAS_NFE) return completo;
  const resumido = preencher(base, {
    lote: v.lote,
    seriais: `${v.seriais.length} unidades; S/N na lista consolidada do lote ${v.lote}`,
    devolucoes: v.devolucoes,
  });
  if (resumido.length <= INFORMACOES_MAXIMAS_NFE) return resumido;
  throw new ErroLotes(`As informações complementares da regra fiscal passam de ${INFORMACOES_MAXIMAS_NFE} caracteres: encurte o modelo em Configurações › Fiscal.`);
}

/** Spec §8.5, sem banco: um item por produto, o custo como valor, sem tributos (decisão 6). */
export function montarNotaRemessaPura(e: EntradaRemessa): NotaParaEmissao {
  if (e.unidades.length === 0) throw new ErroLotes(`O lote ${e.loteCodigo} não tem unidades.`);
  const problemas: string[] = [];
  const faltas = faltasDoFornecedor(e.fornecedor);
  if (faltas.length > 0) {
    problemas.push(`Complete o cadastro do fornecedor ${e.fornecedor.razaoSocial} em Produtos e Fornecedores (falta: ${faltas.join(', ')}).`);
  }
  const vistos = new Set<string>();
  for (const u of e.unidades) {
    if (!u.produtoId) {
      problemas.push(`Unidade ${u.unidade} da ${u.devolucaoCodigo}: sem produto recebido.`);
      continue;
    }
    if (vistos.has(u.produtoId)) continue;
    vistos.add(u.produtoId);
    if (!u.ncm || !/^\d{8}$/.test(u.ncm)) problemas.push(`Produto ${u.sku}: falta o NCM.`);
    if (vazio(u.custo) || !(Number(u.custo) > 0)) problemas.push(`Produto ${u.sku}: falta o custo.`);
  }
  if (problemas.length > 0) throw new ErroLotes(problemas.join(' '));

  const grupos = new Map<string, { base: UnidadeRemessa; quantidade: number }>();
  for (const u of e.unidades) {
    const chave = u.produtoId as string;
    const g = grupos.get(chave);
    if (g) g.quantidade += 1;
    else grupos.set(chave, { base: u, quantidade: 1 });
  }
  const itens: ItemNota[] = [...grupos.values()].map(({ base, quantidade }) => ({
    codigo: base.sku,
    descricao: base.descricao ?? base.sku,
    ncm: base.ncm as string,
    cfop: e.regra.cfop,
    unidade: base.unidadeMedida ?? 'UN',
    quantidade,
    valorUnitario: Number(base.custo),
    ean: base.ean,
    icmsOrigem: 0,
    icmsSituacao: e.regra.icmsSituacaoTributaria,
    pisSituacao: e.regra.pisSituacaoTributaria,
    cofinsSituacao: e.regra.cofinsSituacaoTributaria,
  }));

  const f = e.fornecedor;
  const indicadorIe: 1 | 9 = f.ie ? 1 : 9;
  const destinatario: Destinatario = {
    nome: f.razaoSocial,
    cpf: null,
    cnpj: f.cnpj,
    ie: f.ie,
    indicadorIe,
    logradouro: f.logradouro as string,
    numero: f.numero as string,
    complemento: f.complemento,
    bairro: f.bairro as string,
    cidade: f.cidade as string,
    uf: f.uf as string,
    cep: f.cep as string,
  };
  return {
    referencia: e.referencia,
    tipo: tipoNotaDoLote(e.tipo),
    naturezaOperacao: e.regra.naturezaOperacao,
    entrada: false,
    finalidade: 'NORMAL',
    operacao: e.regra.operacao,
    consumidorFinal: indicadorIe === 9,
    regime: e.config.regime,
    emitente: e.config.emitente,
    destinatario,
    chavesReferenciadas: [],
    itens,
    informacoesComplementares: preencherInformacoesRemessa(e.regra.informacoesComplementares, {
      lote: e.loteCodigo,
      seriais: e.unidades.map((u) => u.serial).filter((s): s is string => Boolean(s)),
      devolucoes: e.unidades.map((u) => u.devolucaoCodigo),
    }),
  };
}

export async function carregarLoteRemessa(
  db: DbOuTx,
  loteId: string,
): Promise<{ codigo: string; status: StatusLote; tipo: TipoLote | null; fornecedor: FornecedorRemessa; unidades: UnidadeRemessa[] } | null> {
  const [l] = await db
    .select({
      codigo: lotes.codigo,
      status: lotes.status,
      tipo: lotes.tipo,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
      ie: fornecedores.ie,
      logradouro: fornecedores.logradouro,
      numero: fornecedores.numero,
      complemento: fornecedores.complemento,
      bairro: fornecedores.bairro,
      cidade: fornecedores.cidade,
      uf: fornecedores.uf,
      cep: fornecedores.cep,
    })
    .from(lotes)
    .innerJoin(fornecedores, eq(fornecedores.id, lotes.fornecedorId))
    .where(eq(lotes.id, loteId));
  if (!l) return null;
  const unidades = await db
    .select({
      itemId: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      devolucaoCodigo: devolucoes.codigo,
      produtoId: itensDevolucao.produtoRecebidoId,
      sku: produtos.sku,
      itemSku: itensDevolucao.sku,
      descricao: produtos.descricao,
      ean: produtos.ean,
      ncm: produtos.ncm,
      custo: produtos.custo,
      unidadeMedida: produtos.unidade,
      serial: itensDevolucao.serial,
    })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoRecebidoId))
    .where(eq(itensDevolucao.loteId, loteId))
    .orderBy(asc(devolucoes.codigo), asc(itensDevolucao.unidade));
  const { codigo, status, tipo, ...fornecedor } = l;
  return {
    codigo,
    status,
    tipo,
    fornecedor,
    unidades: unidades.map(({ sku, itemSku, ...u }) => ({ ...u, sku: sku ?? itemSku })),
  };
}

/**
 * Trava o lote (FOR UPDATE) antes de tudo: dentro da transação de `solicitarEmissao` e `reenviarNota` a trava vale até a nota
 * ser gravada, então um "Reabrir" ao mesmo tempo espera e depois vê a NF ativa (decisão 5).
 */
export async function montarNotaRemessa(db: DbOuTx, loteId: string, referencia: string): Promise<NotaParaEmissao> {
  await db.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, loteId)).for('update');
  const lote = await carregarLoteRemessa(db, loteId);
  if (!lote) throw new ErroLotes('Lote não encontrado.');
  const [outra] = await db
    .select({ situacao: notasFiscais.situacao })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.loteId, loteId), ne(notasFiscais.situacao, 'CANCELADA'), ne(notasFiscais.referenciaEmissor, referencia)))
    .limit(1);
  if (outra) throw new ErroLotes(`O lote já tem outra NF de Remessa ${ROTULO_SITUACAO_NOTA[outra.situacao].toLowerCase()}.`);
  if (lote.status !== 'FECHADO') {
    throw new ErroLotes(`O lote precisa estar Fechado para a NF de Remessa (agora: ${ROTULO_STATUS_LOTE[lote.status]}).`);
  }
  if (!lote.tipo) throw new ErroLotes('Escolha o tipo do lote ao fechar.');
  const config = await lerConfiguracaoFiscal(db);
  const operacao = operacaoPorUf(config.emitente.uf, lote.fornecedor.uf ?? config.emitente.uf);
  const regra = await regraFiscal(db, tipoNotaDoLote(lote.tipo), operacao);
  return montarNotaRemessaPura({ referencia, loteCodigo: lote.codigo, tipo: lote.tipo, config, regra, fornecedor: lote.fornecedor, unidades: lote.unidades });
}
