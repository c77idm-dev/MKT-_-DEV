import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOuTx } from '@/db/client';
import { devolucoes, fornecedores, itensDevolucao, produtos, usuarios } from '@/db/schema';
import { listarEventos } from '@/modules/historico/eventos';

/** Tudo o que a página de detalhe mostra: dados, unidades e histórico. */
export async function obterDetalhe(db: DbOuTx, codigo: string) {
  const criador = alias(usuarios, 'criador');
  const recebedor = alias(usuarios, 'recebedor');
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
    })
    .from(devolucoes)
    .leftJoin(criador, eq(criador.id, devolucoes.criadoPor))
    .leftJoin(recebedor, eq(recebedor.id, devolucoes.recebidaPor))
    .where(eq(devolucoes.codigo, codigo.trim().toUpperCase()))
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
