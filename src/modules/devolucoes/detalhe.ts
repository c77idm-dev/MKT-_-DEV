import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, produtos, usuarios } from '@/db/schema';
import { devolucaoVisivel } from '@/modules/apagadas/filtro';
import { listarEventos } from '@/modules/historico/eventos';

export type OpcoesDetalhe = {
  /**
   * (extra, E29) A apagada não é achada (detalhe, dossiê). Só o Gestor, pela lista Apagadas, pede o detalhe dela com
   * `incluirApagada`.
   */
  incluirApagada?: boolean;
};

/** Tudo o que a página de detalhe mostra: dados, unidades e histórico. */
export async function obterDetalhe(db: DbOuTx, codigo: string, opcoes: OpcoesDetalhe = {}) {
  const criador = alias(usuarios, 'criador');
  const recebedor = alias(usuarios, 'recebedor');
  const apagador = alias(usuarios, 'apagador');
  const [d] = await db
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      canal: devolucoes.canal,
      origem: devolucoes.origem,
      tipo: devolucoes.tipo,
      status: devolucoes.status,
      pedidos: devolucoes.pedidosExternos,
      reclamacaoId: devolucoes.reclamacaoId,
      rastreio: devolucoes.rastreio,
      transportadora: devolucoes.transportadora,
      motivoCliente: devolucoes.motivoCliente,
      postadaEm: devolucoes.postadaEm,
      naoIdentificada: devolucoes.naoIdentificada,
      entregueSegundoCanalEm: devolucoes.entregueSegundoCanalEm,
      criadaEm: devolucoes.criadaEm,
      recebidaEm: devolucoes.recebidaEm,
      criadoPorNome: criador.nome,
      recebidaPorNome: recebedor.nome,
      /** (extra, E29) Os dados que o Gestor corrige (`corrigirDados`) e a marca de apagada. */
      observacoes: devolucoes.observacoes,
      apagadaEm: devolucoes.apagadaEm,
      apagadaPorNome: apagador.nome,
      /** (extra, E29) A tarefa dos 90 dias já apagou de vez o conteúdo (fica a linha mínima da do ML). */
      expurgadaEm: devolucoes.expurgadaEm,
    })
    .from(devolucoes)
    .leftJoin(criador, eq(criador.id, devolucoes.criadoPor))
    .leftJoin(recebedor, eq(recebedor.id, devolucoes.recebidaPor))
    .leftJoin(apagador, eq(apagador.id, devolucoes.apagadaPor))
    .where(and(eq(devolucoes.codigo, codigo.trim().toUpperCase()), opcoes.incluirApagada ? undefined : devolucaoVisivel))
    .limit(1);
  if (!d) return null;
  const itens = await db
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      serial: itensDevolucao.serial,
      status: itensDevolucao.status,
      descricao: produtos.descricao,
      ean: produtos.ean,
      /** Produtos do ML (extra): a foto do anúncio. */
      fotoUrl: produtos.fotoUrl,
      fornecedor: fornecedores.razaoSocial,
    })
    .from(itensDevolucao)
    .leftJoin(produtos, eq(produtos.id, itensDevolucao.produtoEsperadoId))
    .leftJoin(fornecedores, eq(fornecedores.id, produtos.fornecedorId))
    .where(eq(itensDevolucao.devolucaoId, d.id))
    .orderBy(asc(itensDevolucao.unidade));
  const eventos = await listarEventos(db, 'devolucao', d.id);
  return { ...d, itens, eventos };
}

export type DetalheDevolucao = NonNullable<Awaited<ReturnType<typeof obterDetalhe>>>;
