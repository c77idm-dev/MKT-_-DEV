import { eq, or, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, devolucoes, evidencias, reclamacoesMl, usuarios } from '@/db/schema';
import { obterConferencia } from '@/modules/conferencia/leitura';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import { motivoEmCache } from '@/modules/mercado-livre/motivos';
import type { DadosDossie } from './dominio';

/**
 * Tudo o que o dossiê de provas (extra) mostra, num carregamento só. Reaproveita as consultas do detalhe (dados e
 * histórico) e da conferência (unidades e evidências); acrescenta só o que elas não trazem: os hashes e quem enviou
 * cada evidência, a reclamação do ML (motivo e conta) e a razão social. Nenhum dado pessoal do comprador.
 */
export async function carregarDossie(db: DbOuTx, codigo: string, geracao: { em: Date; porNome: string }): Promise<DadosDossie | null> {
  const detalhe = await obterDetalhe(db, codigo);
  if (!detalhe) return null;
  const conferencia = await obterConferencia(db, { id: detalhe.id });
  if (!conferencia) return null;

  const integridade = await db
    .select({
      id: evidencias.id,
      enviadoPorNome: usuarios.nome,
      processadoEm: evidencias.processadoEm,
      tamanho: evidencias.tamanho,
      sha256Original: evidencias.sha256Original,
      sha256Final: evidencias.sha256Final,
    })
    .from(evidencias)
    .leftJoin(usuarios, eq(usuarios.id, evidencias.enviadoPor))
    .where(eq(evidencias.devolucaoId, detalhe.id));
  const porId = new Map(integridade.map((x) => [x.id, x]));

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
    recebidaPorNome: detalhe.recebidaPorNome,
    conferenciaIniciadaEm: conferencia.conferenciaIniciadaEm,
    conferidaEm: conferencia.conferidaEm,
    conferenteNome: conferencia.conferenteNome,
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
    evidencias: conferencia.evidencias.map((e) => {
      const x = porId.get(e.id);
      return {
        id: e.id,
        tipo: e.tipo,
        itemId: e.itemId,
        situacao: e.situacao,
        tipoConteudo: e.tipoConteudo,
        caminho: e.caminho,
        provedor: e.provedor,
        enviadoEm: e.enviadoEm,
        enviadoPorNome: x?.enviadoPorNome ?? null,
        processadoEm: x?.processadoEm ?? null,
        tamanho: x?.tamanho ?? null,
        sha256Original: x?.sha256Original ?? '',
        sha256Final: x?.sha256Final ?? null,
      };
    }),
    eventos: detalhe.eventos.map((e) => ({ acao: e.acao, de: e.de, para: e.para, em: e.em, usuarioNome: e.usuarioNome, dados: e.dados })),
    geradoEm: geracao.em,
    geradoPorNome: geracao.porNome,
  };
}
