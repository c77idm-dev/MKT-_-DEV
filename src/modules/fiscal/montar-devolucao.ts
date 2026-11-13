import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Destinatario, ItemNota, NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasVenda, produtos } from '@/db/schema';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { ROTULO_STATUS, type Canal, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { casarItens, chaveAlvo, type UnidadeParaCasar } from './casamento';
import { lerConfiguracaoFiscal, operacaoPorUf, regraFiscal, type ConfiguracaoFiscal, type RegraFiscal } from './configuracao';
import type { ItemNotaVenda, OrigemNotaVenda } from './dominio';
import { ErroFiscal } from './erros';

export type UnidadeMontagem = UnidadeParaCasar & { serial: string | null; destino: 'BOM' | 'PROBLEMA'; descricao: string | null };
export type NotaVendaMontagem = {
  notaVendaId: string;
  chave: string;
  origem: OrigemNotaVenda;
  emitidaEm: Date | null;
  destinatario: Destinatario;
  itens: ItemNotaVenda[];
};
export type DadosDevolucaoFiscal = {
  codigo: string;
  status: StatusDevolucao;
  canal: Canal | null;
  unidades: UnidadeMontagem[];
  notasVenda: NotaVendaMontagem[];
};
export type EntradaMontagem = {
  referencia: string;
  codigo: string;
  config: ConfiguracaoFiscal;
  regra: RegraFiscal;
  unidades: UnidadeMontagem[];
  notasVenda: NotaVendaMontagem[];
};

/** Decisão 7: só esses CST levam base, alíquota e valor. */
const CST_ICMS_COM_VALOR = new Set(['00', '10', '20', '51', '70', '90']);
const CST_PIS_COFINS_COM_VALOR = new Set(['01', '02']);
const MODELO_PADRAO = 'Devolucao referente a NF-e {chaves}. Devolucao {devolucao}.';

function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Decisão 8: o destinatário é o comprador da NF de venda; com várias NF de venda, tem de ser o mesmo. */
export function destinatarioUnico(notas: NotaVendaMontagem[]): Destinatario {
  if (notas.length === 0) throw new ErroFiscal('Falta a NF de venda: anexe o XML (baixado do Bitbrain) ou busque no Mercado Livre.');
  const documento = (d: Destinatario) => d.cpf ?? d.cnpj ?? '';
  const primeiro = notas[0].destinatario;
  if (notas.some((n) => documento(n.destinatario) !== documento(primeiro))) {
    throw new ErroFiscal('As NF de venda anexadas têm destinatários diferentes: remova a que não é desta devolução.');
  }
  return primeiro;
}

/** Modelo da regra (spec §5.1): {chaves}, {devolucao} e {seriais}. */
export function preencherInformacoes(modelo: string | null, valores: { chaves: string[]; devolucao: string; seriais: string[] }): string {
  return (modelo ?? MODELO_PADRAO)
    .replaceAll('{chaves}', valores.chaves.join(', '))
    .replaceAll('{devolucao}', valores.devolucao)
    .replaceAll('{seriais}', valores.seriais.length > 0 ? valores.seriais.join(', ') : 'sem S/N')
    .trim()
    .slice(0, 5000);
}

function tributos(item: ItemNotaVenda, quantidade: number, regime: RegimeTributario, regra: RegraFiscal): Pick<ItemNota, 'tributos'> {
  if (regime === 'SIMPLES') return {};
  const t = item.tributosPorUnidade;
  const r: NonNullable<ItemNota['tributos']> = {};
  if (CST_ICMS_COM_VALOR.has(regra.icmsSituacaoTributaria) && t.icmsBase !== undefined) {
    r.icmsBase = arredondar(t.icmsBase * quantidade);
    r.icmsAliquota = t.icmsAliquota ?? 0;
    r.icmsValor = arredondar((t.icmsValor ?? 0) * quantidade);
  }
  if (CST_PIS_COFINS_COM_VALOR.has(regra.pisSituacaoTributaria) && t.pisBase !== undefined) {
    r.pisBase = arredondar(t.pisBase * quantidade);
    r.pisAliquota = t.pisAliquota ?? 0;
    r.pisValor = arredondar((t.pisValor ?? 0) * quantidade);
  }
  if (CST_PIS_COFINS_COM_VALOR.has(regra.cofinsSituacaoTributaria) && t.cofinsBase !== undefined) {
    r.cofinsBase = arredondar(t.cofinsBase * quantidade);
    r.cofinsAliquota = t.cofinsAliquota ?? 0;
    r.cofinsValor = arredondar((t.cofinsValor ?? 0) * quantidade);
  }
  return Object.keys(r).length > 0 ? { tributos: r } : {};
}

/** Spec §8.4, sem banco: recebe tudo pronto e devolve a nota (ou ErroFiscal com o que falta). */
export function montarNotaDevolucaoPura(e: EntradaMontagem): NotaParaEmissao {
  if (e.unidades.length === 0) throw new ErroFiscal('Nenhum item da devolução está aguardando NF.');
  const destinatario = destinatarioUnico(e.notasVenda);
  const casamento = new Map(casarItens(e.unidades, e.notasVenda).map((c) => [c.itemId, c]));
  const semPar = e.unidades.filter((u) => !casamento.get(u.itemId)?.alvo);
  if (semPar.length > 0) {
    throw new ErroFiscal(`${semPar.map((u) => `Unidade ${u.unidade} (SKU ${u.sku})`).join(', ')}: escolha o item da NF de venda.`);
  }
  // Um item da NF por item da NF de venda, na ordem da venda, com a quantidade de unidades casadas.
  const grupos: { nota: NotaVendaMontagem; item: ItemNotaVenda; quantidade: number }[] = [];
  for (const nota of e.notasVenda) {
    for (const item of nota.itens) {
      const chave = chaveAlvo({ notaVendaId: nota.notaVendaId, numeroItem: item.numero });
      const quantidade = e.unidades.filter((u) => {
        const alvo = casamento.get(u.itemId)?.alvo;
        return alvo !== null && alvo !== undefined && chaveAlvo(alvo) === chave;
      }).length;
      if (quantidade > 0) grupos.push({ nota, item, quantidade });
    }
  }
  const itens: ItemNota[] = grupos.map(({ item, quantidade }) => {
    if (!/^\d{8}$/.test(item.ncm)) throw new ErroFiscal(`O item ${item.numero} da NF de venda (${item.codigo}) não tem NCM válido.`);
    return {
      codigo: item.codigo,
      descricao: item.descricao,
      ncm: item.ncm,
      cfop: e.regra.cfop,
      unidade: item.unidade,
      quantidade,
      valorUnitario: item.valorUnitario,
      ean: item.ean,
      icmsOrigem: item.origem,
      icmsSituacao: e.regra.icmsSituacaoTributaria,
      pisSituacao: e.regra.pisSituacaoTributaria,
      cofinsSituacao: e.regra.cofinsSituacaoTributaria,
      ...tributos(item, quantidade, e.config.regime, e.regra),
    };
  });
  const chaves = [...new Set(grupos.map((g) => g.nota.chave))];
  const seriais = e.unidades.map((u) => u.serial).filter((s): s is string => Boolean(s));
  return {
    referencia: e.referencia,
    tipo: 'DEVOLUCAO_VENDA',
    naturezaOperacao: e.regra.naturezaOperacao,
    entrada: true,
    finalidade: 'DEVOLUCAO',
    operacao: e.regra.operacao,
    consumidorFinal: destinatario.indicadorIe === 9,
    regime: e.config.regime,
    emitente: e.config.emitente,
    destinatario,
    chavesReferenciadas: chaves,
    itens,
    informacoesComplementares: preencherInformacoes(e.regra.informacoesComplementares, { chaves, devolucao: e.codigo, seriais }),
  };
}

/** As unidades que entram na NF (AGUARDANDO_NF com destino; AUSENTE fica fora, contrato §5.6) e as NF de venda. */
export async function carregarDadosDevolucao(db: DbOuTx, devolucaoId: string): Promise<DadosDevolucaoFiscal | null> {
  const [d] = await db
    .select({ codigo: devolucoes.codigo, status: devolucoes.status, canal: devolucoes.canal })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId));
  if (!d) return null;
  const linhas = await db
    .select({
      itemId: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      eanProduto: produtos.ean,
      eanLido: itensDevolucao.eanLido,
      serial: itensDevolucao.serial,
      destino: itensDevolucao.destino,
      descricao: produtos.descricao,
    })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'AGUARDANDO_NF'), isNotNull(itensDevolucao.destino)))
    .orderBy(asc(itensDevolucao.unidade));
  const notas = await db
    .select({
      notaVendaId: notasVenda.id,
      chave: notasVenda.chave,
      origem: notasVenda.origem,
      emitidaEm: notasVenda.emitidaEm,
      destinatario: notasVenda.destinatario,
      itens: notasVenda.itens,
    })
    .from(notasVenda)
    .where(eq(notasVenda.devolucaoId, devolucaoId))
    .orderBy(asc(notasVenda.criadaEm));
  return {
    codigo: d.codigo,
    status: d.status,
    canal: d.canal,
    unidades: linhas.map((l) => ({
      itemId: l.itemId,
      unidade: l.unidade,
      sku: l.sku,
      // O EAN do produto vendido (esperado); sem cadastro, o que o leitor leu na bancada.
      ean: l.eanProduto ?? l.eanLido ?? null,
      serial: l.serial,
      destino: l.destino as 'BOM' | 'PROBLEMA',
      descricao: l.descricao,
    })),
    notasVenda: notas,
  };
}

/** Contrato §5.7 ("montarNotaDevolucao", spec §8.4): usada na solicitação (para validar), no envio e no reenvio. */
export async function montarNotaDevolucao(db: DbOuTx, devolucaoId: string, referencia: string): Promise<NotaParaEmissao> {
  const config = await lerConfiguracaoFiscal(db);
  const dados = await carregarDadosDevolucao(db, devolucaoId);
  if (!dados) throw new ErroFiscal('Devolução não encontrada.');
  if (dados.status !== 'AGUARDANDO_NF') {
    throw new ErroFiscal(`A devolução está ${ROTULO_STATUS[dados.status]}: a NF de devolução só sai em Aguardando NF.`);
  }
  const destinatario = destinatarioUnico(dados.notasVenda);
  const regra = await regraFiscal(db, 'DEVOLUCAO_VENDA', operacaoPorUf(config.emitente.uf, destinatario.uf));
  return montarNotaDevolucaoPura({ referencia, codigo: dados.codigo, config, regra, unidades: dados.unidades, notasVenda: dados.notasVenda });
}
