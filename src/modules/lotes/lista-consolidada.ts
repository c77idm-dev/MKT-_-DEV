import { asc, eq, inArray } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, notasFiscais, produtos } from '@/db/schema';
import { formatarDataHora } from '@/lib/formatar';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { ROTULO_MOTIVO } from '@/modules/devolucoes/dominio';
import { ROTULO_TIPO_LOTE } from './dominio';
import { ErroLotes } from './erros';
import { obterLotePorCodigo } from './repositorio';

/** Ordem da spec §6.5 (Observação é extra). */
export const COLUNAS_LISTA = ['SKU', 'Descrição', 'Nº de série', 'Motivo', 'Devolução', 'Unidade', 'Observação'] as const;

export type LinhaLista = { devolucao: string; unidade: number; sku: string; descricao: string; serial: string; motivo: string; observacao: string };

export type ListaConsolidada = {
  lote: { codigo: string; tipo: string };
  fornecedor: { razaoSocial: string; cnpj: string; contatoSac: string; emailSac: string };
  nota: { numero: string; serie: string; chave: string; autorizadaEm: string };
  geradaEm: string;
  linhas: LinhaLista[];
};

/** A ordem das células de uma linha, igual a COLUNAS_LISTA: usada pelo Excel e pelo PDF. */
export function celulasDaLinha(x: LinhaLista): [string, string, string, string, string, number, string] {
  return [x.sku, x.descricao, x.serial, x.motivo, x.devolucao, x.unidade, x.observacao];
}

export function cabecalhoDaLista(l: ListaConsolidada): [string, string][] {
  return [
    ['Fornecedor', l.fornecedor.razaoSocial],
    ['CNPJ', l.fornecedor.cnpj],
    ['Contato SAC', l.fornecedor.contatoSac],
    ['E-mail SAC', l.fornecedor.emailSac],
    ['Lote', l.lote.codigo],
    ['Tipo', l.lote.tipo],
    ['NF de Remessa', `${l.nota.numero} (série ${l.nota.serie})`],
    ['Chave de acesso', l.nota.chave],
    ['Autorizada em', l.nota.autorizadaEm],
    ['Gerada em', l.geradaEm],
  ];
}

const VAZIO = '—';

/** Spec §6.5: a lista para o SAC do fabricante. Só existe depois da NF de Remessa autorizada. */
export async function carregarListaConsolidada(db: DbOuTx, codigo: string, agora: Date): Promise<ListaConsolidada | null> {
  const lote = await obterLotePorCodigo(db, codigo);
  if (!lote) return null;
  const semNota = new ErroLotes('A lista consolidada sai depois da NF de Remessa autorizada.');
  if (!lote.notaFiscalId) throw semNota;
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, lote.notaFiscalId));
  if (!nota || nota.situacao !== 'AUTORIZADA') throw semNota;
  const [fornecedor] = await db.select().from(fornecedores).where(eq(fornecedores.id, lote.fornecedorId));
  if (!fornecedor) throw new ErroLotes('Fornecedor do lote não encontrado.');

  const unidades = await db
    .select({ item: itensDevolucao, devolucaoCodigo: devolucoes.codigo })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .where(eq(itensDevolucao.loteId, lote.id))
    .orderBy(asc(devolucoes.codigo), asc(itensDevolucao.unidade));
  const ids = [...new Set(unidades.flatMap(({ item }) => [item.produtoRecebidoId, item.produtoEsperadoId]).filter((x): x is string => !!x))];
  const descricoes = new Map<string, string>();
  const skus = new Map<string, string>();
  if (ids.length > 0) {
    const linhas = await db.select({ id: produtos.id, sku: produtos.sku, descricao: produtos.descricao }).from(produtos).where(inArray(produtos.id, ids));
    for (const p of linhas) {
      descricoes.set(p.id, p.descricao);
      skus.set(p.id, p.sku);
    }
  }
  const descricaoDe = (id: string | null) => (id ? descricoes.get(id) || '' : '');

  return {
    lote: { codigo: lote.codigo, tipo: lote.tipo ? ROTULO_TIPO_LOTE[lote.tipo] : VAZIO },
    fornecedor: {
      razaoSocial: fornecedor.razaoSocial,
      cnpj: formatarCnpj(fornecedor.cnpj),
      contatoSac: fornecedor.contatoSac || VAZIO,
      emailSac: fornecedor.emailSac || VAZIO,
    },
    nota: {
      numero: nota.numero ?? VAZIO,
      serie: nota.serie ?? VAZIO,
      chave: nota.chave ?? VAZIO,
      autorizadaEm: nota.autorizadaEm ? formatarDataHora(nota.autorizadaEm) : VAZIO,
    },
    geradaEm: formatarDataHora(agora),
    linhas: unidades.map(({ item, devolucaoCodigo }) => ({
      devolucao: devolucaoCodigo,
      unidade: item.unidade,
      // O lote é do fornecedor do produto recebido (e a NF usa ele): o SKU da venda só vale sem produto recebido.
      sku: (item.produtoRecebidoId ? skus.get(item.produtoRecebidoId) : undefined) ?? item.sku,
      descricao: descricaoDe(item.produtoRecebidoId) || descricaoDe(item.produtoEsperadoId) || VAZIO,
      serial: item.serial ?? VAZIO,
      motivo: item.motivo ? ROTULO_MOTIVO[item.motivo] : VAZIO,
      observacao: item.observacao ?? '',
    })),
  };
}
