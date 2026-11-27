import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, eventosHistorico, evidencias, itensDevolucao, lotes, produtos } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { devolucaoVisivel } from '@/modules/apagadas/filtro';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { alocarUnidadeProblema } from '@/modules/lotes/alocacao';
import { ROTULO_STATUS_LOTE } from '@/modules/lotes/dominio';
import type { StatusContestacao } from '@/modules/mercado-livre/dominio';
import { decidirResultado, processarResultadoConferencia } from '@/modules/mercado-livre/resultado';
import { armazenamentoDoProvedor } from '@/modules/midia/armazenamento';
import { apagarTemporario } from '@/modules/midia/temporarios';
import { chavePedido, codigosAtivosPorPedido, codigosNaoIdentificadosPorRastreio, mensagemRastreioNaoIdentificado } from './criar';
import { MOTIVOS_ITEM, rotuloStatus, type DestinoItem, type MotivoItem, type StatusDevolucao, type StatusItem } from './dominio';
import { ErroDevolucao } from './erros';
import { exigirSemNotaAtiva } from './excecoes';
import { normalizarRastreio } from './rastreio';
import { exigirTransicao } from './transicoes';
import { exigirTransicaoItem } from './transicoes-item';

/**
 * Corrigir (Gestor) (extra, emenda E29). Toda correção:
 * - é só do Gestor (`administrar`), conferido aqui, no servidor;
 * - roda numa transação, com a devolução travada (SELECT … FOR UPDATE);
 * - grava um evento no histórico com quem, quando e `dados: { antes, depois }`;
 * - recusa o que a regra não deixa com a mensagem do motivo (ErroDevolucao), e nunca desfaz o que já saiu do sistema
 *   (NF autorizada, lote que não está mais Aberto, contestação já enviada ao ML).
 * `aviso`: o que a tela mostra depois de dar certo (ex.: a contestação já enviada que ficou no ML).
 */
export type ResultadoCorrecao = { aviso: string | null };

/** Os dados preenchidos no sistema que o Gestor corrige. O que vem do ML não entra (a sincronização sobrescreveria). */
export type CamposCorrigiveis = {
  /** As observações da devolução. Vazio limpa. */
  observacao?: string;
  /** Só nas que não vieram do ML (origem MANUAL ou PLANILHA, sem vínculo com a devolução do ML). Vazio limpa. */
  rastreio?: string;
  /** Por unidade: o produto recebido (id do cadastro) e a observação. Vazio limpa a observação. */
  itens?: { itemId: string; produtoRecebidoId?: string; observacao?: string }[];
};

const ANTES_DA_NF: readonly StatusDevolucao[] = ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF'];
const ENCERRADAS: readonly StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];
const LIMITE_OBSERVACOES = 1000;
/** O mesmo limite da observação da unidade na conferência (`validarItem`). */
const LIMITE_OBSERVACAO_ITEM = 500;
const LIMITE_RASTREIO = 60;

function exigirGestor(usuario: UsuarioSessao, mensagem: string): void {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroDevolucao(mensagem);
}

/** A devolução travada até o fim da transação. Sem `incluirApagada`, a apagada não é achada. */
async function travar(tx: DbOuTx, id: string, opcoes: { incluirApagada?: boolean } = {}) {
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  const [d] = await tx
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      status: devolucoes.status,
      canal: devolucoes.canal,
      origem: devolucoes.origem,
      pedidos: devolucoes.pedidosExternos,
      naoIdentificada: devolucoes.naoIdentificada,
      devolucaoExternaId: devolucoes.devolucaoExternaId,
      rastreio: devolucoes.rastreio,
      observacoes: devolucoes.observacoes,
      recebidaEm: devolucoes.recebidaEm,
      recebidaPor: devolucoes.recebidaPor,
      conferenteId: devolucoes.conferenteId,
      conferidaEm: devolucoes.conferidaEm,
      apagadaEm: devolucoes.apagadaEm,
      apagadaPor: devolucoes.apagadaPor,
      expurgadaEm: devolucoes.expurgadaEm,
    })
    .from(devolucoes)
    .where(and(eq(devolucoes.id, id), opcoes.incluirApagada ? undefined : devolucaoVisivel))
    .for('update');
  if (!d) throw new ErroDevolucao('Devolução não encontrada.');
  return d;
}
type Travada = Awaited<ReturnType<typeof travar>>;

function iso(data: Date | null): string | null {
  return data ? data.toISOString() : null;
}

async function unidadesDe(tx: DbOuTx, devolucaoId: string) {
  return tx
    .select({
      id: itensDevolucao.id,
      unidade: itensDevolucao.unidade,
      sku: itensDevolucao.sku,
      status: itensDevolucao.status,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
      loteId: itensDevolucao.loteId,
      loteCodigo: lotes.codigo,
    })
    .from(itensDevolucao)
    .leftJoin(lotes, eq(lotes.id, itensDevolucao.loteId))
    .where(eq(itensDevolucao.devolucaoId, devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
}

/** A unidade que já saiu da conferência para um lote (a NF foi cancelada com o lote adiante, decisão 13) segura a correção. */
function exigirSemUnidadeEmLote(unidades: Awaited<ReturnType<typeof unidadesDe>>, oQue: string): void {
  const presa = unidades.find((u) => u.loteId !== null);
  if (presa) throw new ErroDevolucao(`A unidade ${presa.unidade} está no lote ${presa.loteCodigo}: tire-a do lote antes de ${oQue}.`);
}

// --- Contestação do ML (spec §6.6): a que ainda espera o Gestor é descartada; a enviada (ou pedida) fica. ---

type Contestacao = { id: string; status: StatusContestacao; revisadoPor: string | null };

async function contestacaoDa(tx: DbOuTx, devolucaoId: string): Promise<Contestacao | null> {
  const [c] = await tx
    .select({ id: contestacoesCanal.id, status: contestacoesCanal.status, revisadoPor: contestacoesCanal.revisadoPor })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.devolucaoId, devolucaoId));
  return c ?? null;
}

function avisoDaContestacao(c: Contestacao): string {
  if (c.status === 'ENVIADA') return 'A contestação desta devolução já foi enviada ao Mercado Livre e continua lá.';
  if (c.status === 'FALHOU') return 'A contestação desta devolução falhou no envio e continua em Contestações: revise-a antes de enviar de novo.';
  return 'O envio da contestação desta devolução ao Mercado Livre já foi pedido: ela continua lá.';
}

/**
 * Descarta a contestação que ainda espera o Gestor (AGUARDANDO_GESTOR sem envio pedido). O DELETE é condicional: se o
 * Gestor pediu o envio no mesmo instante, ela fica e volta o aviso.
 */
async function descartarContestacao(tx: DbOuTx, devolucaoId: string): Promise<{ descartada: string | null; aviso: string | null }> {
  const c = await contestacaoDa(tx, devolucaoId);
  if (!c) return { descartada: null, aviso: null };
  if (c.status !== 'AGUARDANDO_GESTOR' || c.revisadoPor !== null) return { descartada: null, aviso: avisoDaContestacao(c) };
  const [apagada] = await tx
    .delete(contestacoesCanal)
    .where(and(eq(contestacoesCanal.id, c.id), eq(contestacoesCanal.status, 'AGUARDANDO_GESTOR'), isNull(contestacoesCanal.revisadoPor)))
    .returning({ id: contestacoesCanal.id });
  if (apagada) return { descartada: apagada.id, aviso: null };
  const atual = await contestacaoDa(tx, devolucaoId);
  return { descartada: null, aviso: atual ? avisoDaContestacao(atual) : null };
}

/**
 * Depois da troca de estoque numa devolução do ML: a contestação que espera o Gestor é refeita como o fim da conferência
 * faria (a mesma decisão e o mesmo texto de `processarResultadoConferencia`). Sem unidade com problema, ela só é
 * descartada. O "OK" ao ML nunca é mandado daqui.
 */
async function refazerContestacao(tx: DbOuTx, dev: Travada, agora: Date): Promise<{ descartada: string | null; aviso: string | null }> {
  if (dev.canal !== 'MERCADO_LIVRE') return { descartada: null, aviso: null };
  const r = await descartarContestacao(tx, dev.id);
  if (r.aviso) return r;
  const unidades = await unidadesDe(tx, dev.id);
  if (decidirResultado(unidades).tipo === 'CONTESTAR') await processarResultadoConferencia(tx, dev.id, agora);
  return r;
}

// --- 1. Trocar o estoque da unidade (Bom ↔ Problema). ---

function exigirConferenciaTerminada(status: StatusDevolucao): void {
  if (status === 'AGUARDANDO_NF' || status === 'CONCLUIDA') return;
  if (status === 'CANCELADA' || status === 'EXTRAVIADA') {
    throw new ErroDevolucao(`A devolução está ${rotuloStatus(status).toLowerCase()}: o estoque das unidades não muda mais.`);
  }
  throw new ErroDevolucao('A conferência desta devolução ainda não terminou: o estoque da unidade se escolhe na conferência.');
}

/**
 * Item 1 da E29. Antes da NF (unidade AGUARDANDO_NF), só troca o destino e o motivo. Depois da NF:
 * - Bom (DISPONIVEL_VENDA) → Problema entra no lote ABERTO do fornecedor do produto recebido, criando o lote, ou fica
 *   SEM_FORNECEDOR: a mesma regra da autorização da NF (`alocarUnidadeProblema`, spec §5.3);
 * - Problema no lote ABERTO (ou sem fornecedor) → Bom sai do lote e vai para DISPONIVEL_VENDA.
 * Recusa a unidade ausente, a ENVIADA ou RESOLVIDA e a que está num lote que não está mais ABERTO. Problema → Problema
 * troca só o motivo. Na devolução do ML, a contestação que espera o Gestor é refeita (ou descartada, sem problema
 * nenhum); a enviada fica e volta o aviso.
 */
export async function trocarDestinoItem(
  db: Db,
  itemId: string,
  destino: DestinoItem,
  motivo: MotivoItem | null,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoCorrecao> {
  exigirGestor(usuario, 'Só o Gestor troca o estoque de uma unidade.');
  if (destino !== 'BOM' && destino !== 'PROBLEMA') throw new ErroDevolucao('Escolha Estoque Bom ou Estoque Problema.');
  if (destino === 'PROBLEMA' && (!motivo || motivo === 'AUSENTE' || !MOTIVOS_ITEM.includes(motivo))) {
    throw new ErroDevolucao('Escolha o motivo do Estoque Problema.');
  }
  const motivoNovo: MotivoItem | null = destino === 'PROBLEMA' ? motivo : null;
  if (!ehUuid(itemId)) throw new ErroDevolucao('Unidade não encontrada.');

  return db.transaction(async (tx) => {
    const [previa] = await tx.select({ devolucaoId: itensDevolucao.devolucaoId }).from(itensDevolucao).where(eq(itensDevolucao.id, itemId));
    if (!previa) throw new ErroDevolucao('Unidade não encontrada.');
    const dev = await travar(tx, previa.devolucaoId);
    exigirConferenciaTerminada(dev.status);

    // Ordem das travas igual à dos lotes (lote, depois unidade): quem move a unidade de lote trava o lote antes.
    const [leitura] = await tx.select({ loteId: itensDevolucao.loteId }).from(itensDevolucao).where(eq(itensDevolucao.id, itemId));
    const [lote] = leitura?.loteId
      ? await tx.select({ id: lotes.id, codigo: lotes.codigo, status: lotes.status }).from(lotes).where(eq(lotes.id, leitura.loteId)).for('update')
      : [];
    const [item] = await tx
      .select({
        id: itensDevolucao.id,
        unidade: itensDevolucao.unidade,
        status: itensDevolucao.status,
        destino: itensDevolucao.destino,
        motivo: itensDevolucao.motivo,
        loteId: itensDevolucao.loteId,
        produtoRecebidoId: itensDevolucao.produtoRecebidoId,
      })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.id, itemId))
      .for('update');
    if (!item || item.loteId !== (lote?.id ?? null)) throw new ErroDevolucao('A unidade acabou de mudar de lote. Tente de novo.');

    const u = item.unidade;
    if (item.status === 'AUSENTE' || item.destino === null) throw new ErroDevolucao(`A unidade ${u} está ausente. Para mudar, reabra a conferência.`);
    if (item.status === 'ENVIADO') throw new ErroDevolucao(`A unidade ${u} já foi enviada ao fornecedor: o estoque dela não muda mais.`);
    if (item.status === 'RESOLVIDO') throw new ErroDevolucao(`A unidade ${u} já foi resolvida com o fornecedor: o estoque dela não muda mais.`);
    if (item.status === 'PENDENTE') throw new ErroDevolucao(`A conferência da unidade ${u} ainda não terminou.`);
    if (lote && lote.status !== 'ABERTO') {
      throw new ErroDevolucao(
        `A unidade ${u} está no lote ${lote.codigo} (${ROTULO_STATUS_LOTE[lote.status]}): só dá para trocar o estoque enquanto o lote está Aberto.`,
      );
    }
    if (item.destino === destino && item.motivo === motivoNovo) {
      throw new ErroDevolucao(destino === 'BOM' ? `A unidade ${u} já está no Estoque Bom.` : `A unidade ${u} já está no Estoque Problema com este motivo.`);
    }

    const antes = { destino: item.destino, motivo: item.motivo, status: item.status, loteCodigo: lote?.codigo ?? null };
    let status: StatusItem = item.status;
    let loteCodigo: string | null = lote?.codigo ?? null;
    await tx.update(itensDevolucao).set({ destino, motivo: motivoNovo }).where(eq(itensDevolucao.id, itemId));

    if (item.destino === 'BOM' && destino === 'PROBLEMA' && item.status === 'DISPONIVEL_VENDA') {
      const [produto] = item.produtoRecebidoId
        ? await tx.select({ fornecedorId: produtos.fornecedorId }).from(produtos).where(eq(produtos.id, item.produtoRecebidoId))
        : [];
      const alocacao = await alocarUnidadeProblema(
        tx,
        dev.id,
        { id: item.id, unidade: u, produtoRecebidoId: item.produtoRecebidoId, fornecedorId: produto?.fornecedorId ?? null },
        { de: 'DISPONIVEL_VENDA', ator: usuario.perfil, usuarioId: usuario.id, agora },
      );
      status = alocacao.status;
      loteCodigo = alocacao.status === 'EM_LOTE' ? alocacao.loteCodigo : null;
    } else if (item.destino === 'PROBLEMA' && destino === 'BOM' && (item.status === 'EM_LOTE' || item.status === 'SEM_FORNECEDOR')) {
      exigirTransicaoItem({ de: item.status, para: 'DISPONIVEL_VENDA', ator: usuario.perfil });
      await tx.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA', loteId: null }).where(eq(itensDevolucao.id, itemId));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: itemId,
        acao: 'item_status',
        de: item.status,
        para: 'DISPONIVEL_VENDA',
        usuarioId: usuario.id,
        em: agora,
        dados: { devolucaoId: dev.id, motivo: 'Estoque trocado para Bom pelo Gestor', ...(lote ? { loteId: lote.id, loteCodigo: lote.codigo } : {}) },
      });
      if (lote) {
        await registrarEvento(tx, {
          entidade: 'lote',
          entidadeId: lote.id,
          acao: 'lote_item_removido',
          usuarioId: usuario.id,
          em: agora,
          dados: { itemId, devolucaoId: dev.id, unidade: u, motivo: 'Estoque trocado para Bom pelo Gestor' },
        });
      }
      status = 'DISPONIVEL_VENDA';
      loteCodigo = null;
    }
    // Os outros casos (antes da NF, ou Problema → Problema) só trocam o destino e o motivo, gravados acima.

    const { descartada, aviso } = await refazerContestacao(tx, dev, agora);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: dev.id,
      acao: 'destino_trocado',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        itemId,
        unidade: u,
        antes,
        depois: { destino, motivo: motivoNovo, status, loteCodigo },
        ...(descartada ? { contestacaoDescartada: descartada } : {}),
      },
    });
    return { aviso };
  });
}

// --- 2. Reabrir a conferência. ---

/**
 * Item 2 da E29: Aguardando NF → Aguardando conferência, sem NF em processamento ou autorizada. Tudo o que foi
 * preenchido fica (destinos, motivos, campos e evidências); as unidades voltam a PENDENTE para quem abrir a conferência
 * continuar de onde estava. A contestação que espera o Gestor é descartada e volta no fim da nova conferência (a fila
 * ganha uma chave nova em `concluirConferencia`).
 */
export async function reabrirConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<ResultadoCorrecao> {
  exigirGestor(usuario, 'Só o Gestor reabre a conferência.');
  return db.transaction(async (tx) => {
    const dev = await travar(tx, devolucaoId);
    // A NF primeiro: na concluída com NF autorizada, o caminho é o Fiscal cancelar a NF (ela volta a Aguardando NF).
    await exigirSemNotaAtiva(tx, dev.id);
    if (dev.status !== 'AGUARDANDO_NF') throw new ErroDevolucao('Só dá para reabrir a conferência de uma devolução Aguardando NF.');
    exigirTransicao({ de: 'AGUARDANDO_NF', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil });
    const unidades = await unidadesDe(tx, dev.id);
    exigirSemUnidadeEmLote(unidades, 'reabrir a conferência');
    for (const u of unidades) {
      if (u.status !== 'PENDENTE') exigirTransicaoItem({ de: u.status, para: 'PENDENTE', ator: usuario.perfil });
    }
    await tx.update(itensDevolucao).set({ status: 'PENDENTE' }).where(eq(itensDevolucao.devolucaoId, dev.id));
    await tx
      .update(devolucoes)
      .set({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, conferenciaIniciadaEm: null, conferidaEm: null, atualizadaEm: agora })
      .where(eq(devolucoes.id, dev.id));
    const { descartada, aviso } = await descartarContestacao(tx, dev.id);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: dev.id,
      acao: 'conferencia_reaberta',
      de: 'AGUARDANDO_NF',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        antes: { status: 'AGUARDANDO_NF', conferenteId: dev.conferenteId, conferidaEm: iso(dev.conferidaEm) },
        depois: { status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, conferidaEm: null },
        unidades: unidades.length,
        ...(descartada ? { contestacaoDescartada: descartada } : {}),
      },
    });
    return { aviso };
  });
}

// --- 3. Desfazer a chegada. ---

/** Para onde a devolução volta: No CD quando a chegada (o último evento `recebida`) veio do armazém do ML (E25). */
async function statusAntesDaChegada(tx: DbOuTx, devolucaoId: string): Promise<'PENDENTE_CHEGADA' | 'NO_CD_MARKETPLACE'> {
  const [e] = await tx
    .select({ de: eventosHistorico.de, dados: eventosHistorico.dados })
    .from(eventosHistorico)
    .where(and(eq(eventosHistorico.entidade, 'devolucao'), eq(eventosHistorico.entidadeId, devolucaoId), eq(eventosHistorico.acao, 'recebida')))
    .orderBy(desc(eventosHistorico.id))
    .limit(1);
  return e?.de === 'NO_CD_MARKETPLACE' || e?.dados?.voltouDoArmazemML === true ? 'NO_CD_MARKETPLACE' : 'PENDENTE_CHEGADA';
}

/**
 * Item 3 da E29: Aguardando conferência, Em conferência ou Aguardando NF → Pendente de chegada (ou No CD do marketplace,
 * se a chegada veio de lá), sem NF em processamento ou autorizada. Some a chegada (quem e quando), a trava é solta e
 * são descartadas as fotos do pacote, a conferência feita (destinos, motivos, campos e evidências, com as mídias no
 * armazenamento, apagadas depois da transação) e a contestação que espera o Gestor. Não vale para a não identificada.
 */
export async function desfazerChegada(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<ResultadoCorrecao> {
  exigirGestor(usuario, 'Só o Gestor desfaz a chegada.');
  const { resultado, arquivos } = await db.transaction(async (tx) => {
    const dev = await travar(tx, devolucaoId);
    if (dev.naoIdentificada) throw new ErroDevolucao('O pacote não identificado não tem para onde voltar. Para tirá-lo da lista, apague-o.');
    await exigirSemNotaAtiva(tx, dev.id);
    if (!ANTES_DA_NF.includes(dev.status)) {
      throw new ErroDevolucao('Só dá para desfazer a chegada de uma devolução Aguardando conferência, Em conferência ou Aguardando NF.');
    }
    const para = await statusAntesDaChegada(tx, dev.id);
    exigirTransicao({ de: dev.status, para, ator: usuario.perfil });
    const unidades = await unidadesDe(tx, dev.id);
    exigirSemUnidadeEmLote(unidades, 'desfazer a chegada');
    for (const u of unidades) {
      if (u.status !== 'PENDENTE') exigirTransicaoItem({ de: u.status, para: 'PENDENTE', ator: usuario.perfil });
    }
    await tx
      .update(itensDevolucao)
      .set({
        status: 'PENDENTE',
        destino: null,
        motivo: null,
        serial: null,
        loteFabricacao: null,
        validade: null,
        eanLido: null,
        produtoRecebidoId: null,
        observacao: null,
      })
      .where(eq(itensDevolucao.devolucaoId, dev.id));
    const apagadas = await tx.delete(evidencias).where(eq(evidencias.devolucaoId, dev.id)).returning();
    await tx
      .update(devolucoes)
      .set({ status: para, recebidaEm: null, recebidaPor: null, conferenteId: null, conferenciaIniciadaEm: null, conferidaEm: null, atualizadaEm: agora })
      .where(eq(devolucoes.id, dev.id));
    const { descartada, aviso } = await descartarContestacao(tx, dev.id);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: dev.id,
      acao: 'chegada_desfeita',
      de: dev.status,
      para,
      usuarioId: usuario.id,
      em: agora,
      dados: {
        antes: { status: dev.status, recebidaEm: iso(dev.recebidaEm), recebidaPor: dev.recebidaPor, conferenteId: dev.conferenteId },
        depois: { status: para, recebidaEm: null, recebidaPor: null, conferenteId: null },
        unidades: unidades.length,
        evidenciasDescartadas: apagadas.length,
        // O histórico guarda o que existiu (como na remoção da foto da avaria): id, tipo e hashes.
        evidencias: apagadas.map((e) => ({ evidenciaId: e.id, tipo: e.tipo, itemId: e.itemId, sha256_original: e.sha256Original, sha256_final: e.sha256Final })),
        ...(descartada ? { contestacaoDescartada: descartada } : {}),
      },
    });
    return { resultado: { aviso }, arquivos: apagadas };
  });
  // Os arquivos saem depois da transação: se ela voltar, nada se perde. Falha ao apagar um arquivo não desfaz a correção.
  for (const a of arquivos) {
    if (a.caminho && a.provedor) await armazenamentoDoProvedor(a.provedor).apagar(a.caminho).catch(() => undefined);
    if (a.caminhoTemporario) await apagarTemporario(a.caminhoTemporario).catch(() => undefined);
  }
  return resultado;
}

// --- 4. Editar os dados preenchidos no sistema. ---

function textoOuNulo(bruto: string, limite: number, nome: string): string | null {
  const limpo = bruto.trim();
  if (limpo.length > limite) throw new ErroDevolucao(`${nome}: no máximo ${limite} caracteres.`);
  return limpo || null;
}

/**
 * Item 4 da E29: o produto recebido e a observação de cada unidade, as observações da devolução e o rastreio das que não
 * vieram do ML. O motivo muda pela troca de estoque (`trocarDestinoItem`); a quantidade, reabrindo a conferência e
 * marcando a unidade como ausente (cada item é uma unidade). Sem mudança nenhuma, nada é gravado e volta o aviso.
 */
export async function corrigirDados(
  db: Db,
  devolucaoId: string,
  campos: CamposCorrigiveis,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResultadoCorrecao> {
  exigirGestor(usuario, 'Só o Gestor corrige os dados da devolução.');
  const observacoes = campos.observacao === undefined ? undefined : textoOuNulo(campos.observacao, LIMITE_OBSERVACOES, 'Observações');
  const rastreio = campos.rastreio === undefined ? undefined : normalizarRastreio(campos.rastreio) || null;
  if (rastreio && rastreio.length > LIMITE_RASTREIO) throw new ErroDevolucao('Código de rastreamento longo demais.');
  const itens = (campos.itens ?? []).map((c) => {
    if (!ehUuid(c.itemId)) throw new ErroDevolucao('Unidade não encontrada nesta devolução.');
    if (c.produtoRecebidoId !== undefined && !ehUuid(c.produtoRecebidoId)) throw new ErroDevolucao('Produto não encontrado no cadastro.');
    return {
      itemId: c.itemId,
      produtoRecebidoId: c.produtoRecebidoId,
      observacao: c.observacao === undefined ? undefined : textoOuNulo(c.observacao, LIMITE_OBSERVACAO_ITEM, 'Observação'),
    };
  });
  if (new Set(itens.map((i) => i.itemId)).size !== itens.length) throw new ErroDevolucao('A mesma unidade veio duas vezes.');

  return db.transaction(async (tx) => {
    const dev = await travar(tx, devolucaoId);
    const antes: Record<string, unknown> = {};
    const depois: Record<string, unknown> = {};
    if (observacoes !== undefined && observacoes !== dev.observacoes) {
      antes.observacoes = dev.observacoes;
      depois.observacoes = observacoes;
    }
    if (rastreio !== undefined && rastreio !== dev.rastreio) {
      // A sincronização do ML grava o rastreio da devolução ligada a ele (spec §7.3): editar aqui seria sobrescrito.
      if (dev.origem === 'API' || dev.devolucaoExternaId) throw new ErroDevolucao('O rastreio desta devolução vem do Mercado Livre: a sincronização o atualiza.');
      if (!rastreio && dev.naoIdentificada) throw new ErroDevolucao('O pacote não identificado precisa do rastreio.');
      if (rastreio) {
        const outro = (await codigosNaoIdentificadosPorRastreio(tx, [rastreio], dev.id)).get(rastreio);
        if (outro) throw new ErroDevolucao(mensagemRastreioNaoIdentificado(outro));
      }
      antes.rastreio = dev.rastreio;
      depois.rastreio = rastreio;
    }

    const unidadesAntes: Record<number, Record<string, unknown>> = {};
    const unidadesDepois: Record<number, Record<string, unknown>> = {};
    for (const c of itens) {
      const [item] = await tx
        .select({
          id: itensDevolucao.id,
          unidade: itensDevolucao.unidade,
          status: itensDevolucao.status,
          produtoRecebidoId: itensDevolucao.produtoRecebidoId,
          observacao: itensDevolucao.observacao,
          loteCodigo: lotes.codigo,
        })
        .from(itensDevolucao)
        .leftJoin(lotes, eq(lotes.id, itensDevolucao.loteId))
        .where(and(eq(itensDevolucao.id, c.itemId), eq(itensDevolucao.devolucaoId, dev.id)))
        .for('update', { of: itensDevolucao });
      if (!item) throw new ErroDevolucao('Unidade não encontrada nesta devolução.');
      const mudancas: { produtoRecebidoId?: string; observacao?: string | null } = {};
      if (c.produtoRecebidoId !== undefined && c.produtoRecebidoId !== item.produtoRecebidoId) {
        if (item.status === 'AUSENTE') throw new ErroDevolucao(`A unidade ${item.unidade} está ausente: não tem produto recebido.`);
        // O lote é do fornecedor do produto: trocar o produto de quem já está no lote misturaria fornecedores.
        if (item.loteCodigo) {
          throw new ErroDevolucao(`A unidade ${item.unidade} está no lote ${item.loteCodigo}: o produto recebido não muda depois de entrar no lote.`);
        }
        const [produto] = await tx.select({ id: produtos.id }).from(produtos).where(eq(produtos.id, c.produtoRecebidoId));
        if (!produto) throw new ErroDevolucao('Produto não encontrado no cadastro.');
        mudancas.produtoRecebidoId = c.produtoRecebidoId;
      }
      if (c.observacao !== undefined && c.observacao !== item.observacao) mudancas.observacao = c.observacao;
      if (Object.keys(mudancas).length === 0) continue;
      await tx.update(itensDevolucao).set(mudancas).where(eq(itensDevolucao.id, item.id));
      unidadesAntes[item.unidade] = Object.fromEntries(Object.keys(mudancas).map((k) => [k, item[k as keyof typeof mudancas]]));
      unidadesDepois[item.unidade] = mudancas;
    }
    if (Object.keys(unidadesDepois).length > 0) {
      antes.unidades = unidadesAntes;
      depois.unidades = unidadesDepois;
    }
    if (Object.keys(depois).length === 0) return { aviso: 'Nenhum dado mudou.' };

    await tx
      .update(devolucoes)
      .set({
        ...('observacoes' in depois ? { observacoes: depois.observacoes as string | null } : {}),
        ...('rastreio' in depois ? { rastreio: depois.rastreio as string | null } : {}),
        atualizadaEm: agora,
      })
      .where(eq(devolucoes.id, dev.id));
    await registrarEvento(tx, { entidade: 'devolucao', entidadeId: dev.id, acao: 'dados_corrigidos', usuarioId: usuario.id, em: agora, dados: { antes, depois } });
    return { aviso: null };
  });
}

// --- 6. Apagar e restaurar. ---

/**
 * Item 6 da E29: apagar esconde, não exclui (`apagada_em`, `apagada_por`). Vale em qualquer status, menos com NF de
 * devolução autorizada (o Fiscal cancela antes) ou em processamento, e com unidade num lote. A trava da conferência é
 * solta (Em conferência → Aguardando conferência). A contestação sai da lista junto (filtro `devolucaoVisivel`); a já
 * enviada continua no ML. Vale também para a do ML: a sincronização continua achando a linha e não cria outra.
 */
export async function apagarDevolucao(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<ResultadoCorrecao> {
  exigirGestor(usuario, 'Só o Gestor apaga devoluções.');
  return db.transaction(async (tx) => {
    const dev = await travar(tx, devolucaoId, { incluirApagada: true });
    if (dev.apagadaEm) throw new ErroDevolucao('Esta devolução já está apagada.');
    await exigirSemNotaAtiva(tx, dev.id);
    exigirSemUnidadeEmLote(await unidadesDe(tx, dev.id), 'apagar a devolução');
    const soltarTrava = dev.status === 'EM_CONFERENCIA';
    const status: StatusDevolucao = soltarTrava ? 'AGUARDANDO_CONFERENCIA' : dev.status;
    if (soltarTrava) exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil });
    await tx
      .update(devolucoes)
      .set({
        apagadaEm: agora,
        apagadaPor: usuario.id,
        ...(soltarTrava ? { status, conferenteId: null, conferenciaIniciadaEm: null } : {}),
        atualizadaEm: agora,
      })
      .where(eq(devolucoes.id, dev.id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: dev.id,
      acao: 'devolucao_apagada',
      ...(soltarTrava ? { de: dev.status, para: status } : {}),
      usuarioId: usuario.id,
      em: agora,
      dados: {
        antes: { status: dev.status, conferenteId: dev.conferenteId, apagadaEm: null, apagadaPor: null },
        depois: { status, conferenteId: soltarTrava ? null : dev.conferenteId, apagadaEm: agora.toISOString(), apagadaPor: usuario.id },
      },
    });
    return { aviso: null };
  });
}

/**
 * "Restaurar" da lista Apagadas: limpa a marca e a devolução volta exatamente para onde estava (o status não muda). A
 * expurgada (90 dias) não volta. Avisa quando o pedido ganhou outra devolução em andamento enquanto esta estava apagada.
 */
export async function restaurarDevolucao(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<ResultadoCorrecao> {
  exigirGestor(usuario, 'Só o Gestor restaura devoluções.');
  return db.transaction(async (tx) => {
    const dev = await travar(tx, devolucaoId, { incluirApagada: true });
    if (!dev.apagadaEm) throw new ErroDevolucao('Esta devolução não está apagada.');
    if (dev.expurgadaEm) throw new ErroDevolucao('Esta devolução foi apagada de vez depois de 90 dias e não volta.');
    // Antes de limpar a marca: ainda escondida, ela mesma não aparece na consulta dos pedidos em andamento.
    const avisos: string[] = [];
    const canal = dev.canal;
    if (canal && !ENCERRADAS.includes(dev.status)) {
      const outras = await codigosAtivosPorPedido(tx, dev.pedidos.map((pedido) => ({ canal, pedido })));
      for (const pedido of dev.pedidos) {
        const codigo = outras.get(chavePedido(canal, pedido));
        if (codigo) avisos.push(`O pedido ${pedido} também está na devolução ${codigo}, em andamento.`);
      }
    }
    await tx.update(devolucoes).set({ apagadaEm: null, apagadaPor: null, atualizadaEm: agora }).where(eq(devolucoes.id, dev.id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: dev.id,
      acao: 'devolucao_restaurada',
      usuarioId: usuario.id,
      em: agora,
      dados: { antes: { apagadaEm: iso(dev.apagadaEm), apagadaPor: dev.apagadaPor }, depois: { apagadaEm: null, apagadaPor: null }, status: dev.status },
    });
    return { aviso: avisos.length > 0 ? avisos.join(' ') : null };
  });
}
