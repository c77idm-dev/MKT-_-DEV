import { eq, or, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, devolucoes, reclamacoesMl } from '@/db/schema';
import { obterConferencia } from '@/modules/conferencia/leitura';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import { motivoEmCache } from '@/modules/mercado-livre/motivos';
import type { DadosDossie } from './dominio';

/**
 * Tudo o que o dossiê de provas (extra) mostra, num carregamento só. Reaproveita as consultas do detalhe (dados) e da
 * conferência (unidades e evidências); acrescenta só o que elas não trazem: a reclamação do ML (motivo e conta) e a
 * razão social. Nenhum campo de texto com dado do comprador (o destinatário da NF fica de fora); a Foto 1 pode mostrar
 * o nome e o endereço dele na etiqueta. Sem histórico, hashes nem nomes de pessoas (E28).
 */
export async function carregarDossie(db: DbOuTx, codigo: string, geracao: { em: Date }): Promise<DadosDossie | null> {
  const detalhe = await obterDetalhe(db, codigo);
  if (!detalhe) return null;
  const conferencia = await obterConferencia(db, { id: detalhe.id });
  if (!conferencia) return null;

  const ehML = detalhe.canal === 'MERCADO_LIVRE';
  const [ml] = await db
    .select({
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      motivoId: reclamacoesMl.motivoId,
      conta: sql<string | null>`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})`,
    })
    .from(devolucoes)
    .leftJoin(reclamacoesMl, or(eq(reclamacoesMl.devolucaoId, devolucoes.id), eq(reclamacoesMl.claimId, devolucoes.reclamacaoId)))
    .leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))
    .where(eq(devolucoes.id, detalhe.id))
    .orderBy(sql`${reclamacoesMl.sincronizadaEm} desc nulls last`)
    .limit(1);
  const motivoId = ehML ? (ml?.motivoId ?? null) : null;
  const config = await lerConfiguracao(db);

  return {
    id: detalhe.id,
    codigo: detalhe.codigo,
    canal: detalhe.canal,
    empresa: config.razaoSocial,
    pedidos: detalhe.pedidos,
    reclamacaoId: detalhe.reclamacaoId,
    devolucaoExternaId: ml?.devolucaoExternaId ?? null,
    contaML: ehML ? (ml?.conta ?? null) : null,
    motivoReclamacaoML: motivoId ? { id: motivoId, texto: await motivoEmCache(db, motivoId) } : null,
    rastreio: detalhe.rastreio,
    transportadora: detalhe.transportadora,
    motivoCliente: detalhe.motivoCliente,
    recebidaEm: detalhe.recebidaEm,
    conferenciaIniciadaEm: conferencia.conferenciaIniciadaEm,
    conferidaEm: conferencia.conferidaEm,
    unidades: conferencia.itens.map((i) => ({
      id: i.id,
      unidade: i.unidade,
      sku: i.sku,
      status: i.status,
      descricao: i.descricao,
      eanEsperado: i.eanEsperado,
      eanLido: i.eanLido,
      divergente: i.divergente,
      produtoRecebido: i.produtoRecebido,
      serial: i.serial,
      loteFabricacao: i.loteFabricacao,
      validade: i.validade,
      destino: i.destino,
      motivo: i.motivo,
      observacao: i.observacao,
    })),
    evidencias: conferencia.evidencias.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      itemId: e.itemId,
      situacao: e.situacao,
      tipoConteudo: e.tipoConteudo,
      caminho: e.caminho,
      provedor: e.provedor,
      enviadoEm: e.enviadoEm,
    })),
    geradoEm: geracao.em,
  };
}
