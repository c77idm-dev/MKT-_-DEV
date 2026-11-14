import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao, produtos, usuarios } from '@/db/schema';
import type { VideoObrigatorio } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import type { Canal, DestinoItem, MotivoItem, StatusDevolucao, StatusItem } from '@/modules/devolucoes/dominio';
import type { SituacaoProcessamento, TipoEvidencia } from '@/modules/midia/dominio';

export type ItemConferencia = {
  id: string;
  unidade: number;
  sku: string;
  status: StatusItem;
  /** Do produto esperado (vazio quando o SKU está fora do cadastro). */
  descricao: string | null;
  eanEsperado: string | null;
  serial: string | null;
  loteFabricacao: string | null;
  validade: string | null;
  eanLido: string | null;
  produtoRecebido: { sku: string; descricao: string } | null;
  /** Leu um EAN e o produto recebido não é o esperado. */
  divergente: boolean;
  destino: DestinoItem | null;
  motivo: MotivoItem | null;
  observacao: string | null;
};

export type EvidenciaConferencia = {
  id: string;
  tipo: TipoEvidencia;
  itemId: string | null;
  situacao: SituacaoProcessamento;
  tipoConteudo: string;
  caminho: string | null;
  provedor: string | null;
  enviadoEm: Date;
  erro: string | null;
};

export type DadosConferencia = {
  id: string;
  codigo: string;
  status: StatusDevolucao;
  canal: Canal | null;
  naoIdentificada: boolean;
  rastreio: string | null;
  conferenteId: string | null;
  conferenteNome: string | null;
  conferenciaIniciadaEm: Date | null;
  conferidaEm: Date | null;
  videoObrigatorio: VideoObrigatorio;
  itens: ItemConferencia[];
  evidencias: EvidenciaConferencia[];
};

/** Tudo o que a bancada e a seção "Conferência" do detalhe mostram. */
export async function obterConferencia(db: DbOuTx, chave: { id: string } | { codigo: string }): Promise<DadosConferencia | null> {
  const conferente = alias(usuarios, 'conferente');
  const onde = 'id' in chave ? eq(devolucoes.id, chave.id) : eq(devolucoes.codigo, chave.codigo.trim().toUpperCase());
  const [d] = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      status: devolucoes.status,
      canal: devolucoes.canal,
      naoIdentificada: devolucoes.naoIdentificada,
      rastreio: devolucoes.rastreio,
      conferenteId: devolucoes.conferenteId,
      conferenteNome: conferente.nome,
      conferenciaIniciadaEm: devolucoes.conferenciaIniciadaEm,
      conferidaEm: devolucoes.conferidaEm,
    })
    .from(devolucoes)
    .leftJoin(conferente, eq(conferente.id, devolucoes.conferenteId))
    .where(onde)
    .limit(1);
  if (!d) return null;

  const esperado = alias(produtos, 'esperado');
  const recebido = alias(produtos, 'recebido');
  const linhas = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      descricao: esperado.descricao,
      eanEsperado: esperado.ean,
      serial: itensDevolucao.serial,
      loteFabricacao: itensDevolucao.loteFabricacao,
      validade: itensDevolucao.validade,
      eanLido: itensDevolucao.eanLido,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
      produtoEsperadoId: itensDevolucao.produtoEsperadoId,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
      recebidoSku: recebido.sku,
      recebidoDescricao: recebido.descricao,
    })
    .from(itensDevolucao)
    .leftJoin(esperado, eq(esperado.id, itensDevolucao.produtoEsperadoId))
    .leftJoin(recebido, eq(recebido.id, itensDevolucao.produtoRecebidoId))
    .where(eq(itensDevolucao.devolucaoId, d.id))
    .orderBy(asc(itensDevolucao.unidade));

  const lista = await db
    .select({
      id: evidencias.id,
      tipo: evidencias.tipo,
      itemId: evidencias.itemId,
      situacao: evidencias.situacaoProcessamento,
      tipoConteudo: evidencias.tipoConteudo,
      caminho: evidencias.caminho,
      provedor: evidencias.provedor,
      enviadoEm: evidencias.enviadoEm,
      erro: evidencias.erroProcessamento,
    })
    .from(evidencias)
    .where(eq(evidencias.devolucaoId, d.id))
    .orderBy(asc(evidencias.enviadoEm));

  const config = await lerConfiguracao(db);
  return {
    ...d,
    videoObrigatorio: config.videoObrigatorio,
    itens: linhas.map(({ produtoEsperadoId, produtoRecebidoId, recebidoSku, recebidoDescricao, ...item }) => ({
      ...item,
      produtoRecebido: produtoRecebidoId && recebidoSku ? { sku: recebidoSku, descricao: recebidoDescricao ?? '' } : null,
      divergente: item.eanLido !== null && produtoRecebidoId !== produtoEsperadoId,
    })),
    evidencias: lista,
  };
}
