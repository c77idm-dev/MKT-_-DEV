import { and, eq } from 'drizzle-orm';
import { ErroEmissorIndisponivel, ErroEmissorRecusou } from '@/conectores/nfe/erros';
import { obterEmissorNFe } from '@/conectores/nfe/registro';
import type { EmissorNFe, SituacaoNota } from '@/conectores/nfe/tipos';
import type { Db, DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { portaLotes } from '@/modules/lotes/porta';
import { salvarArquivo } from './arquivos';
import { caminhoDoCancelamento } from './ciclo';
import { dentroDoPrazoDeCancelamento, JUSTIFICATIVA_MAXIMA, JUSTIFICATIVA_MINIMA } from './dominio';
import { ErroFiscal } from './erros';
import { exigirPodeEmitir, obterNota } from './notas';
import { exigirTransicaoNota } from './transicoes-nota';

/** Contrato §5.7 e spec §8.6: cancela na hora (a Focus é síncrona) e desfaz o efeito na mesma transação. */
export async function cancelarNota(db: Db, notaFiscalId: string, justificativa: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirPodeEmitir(usuario);
  const texto = justificativa.trim().replace(/\s+/g, ' ');
  if (texto.length < JUSTIFICATIVA_MINIMA || texto.length > JUSTIFICATIVA_MAXIMA) {
    throw new ErroFiscal(`A justificativa precisa ter de ${JUSTIFICATIVA_MINIMA} a ${JUSTIFICATIVA_MAXIMA} caracteres.`);
  }
  const nota = await obterNota(db, notaFiscalId);
  if (!nota) throw new ErroFiscal('NF não encontrada.');
  if (nota.situacao !== 'AUTORIZADA' || !nota.autorizadaEm) throw new ErroFiscal('Só uma NF autorizada pode ser cancelada.');
  if (!dentroDoPrazoDeCancelamento(nota.autorizadaEm, agora)) {
    throw new ErroFiscal('O prazo de cancelamento (24 horas depois da autorização) já passou. Fale com o contador sobre a nota de estorno.');
  }
  if (nota.tipo === 'DEVOLUCAO_VENDA' && nota.devolucaoId) {
    const motivo = await portaLotes.motivoParaNaoCancelarDevolucao(db, nota.devolucaoId);
    if (motivo) throw new ErroFiscal(motivo);
  }

  let emissor: EmissorNFe;
  let resposta: SituacaoNota;
  try {
    emissor = obterEmissorNFe(nota.ambiente);
    resposta = await emissor.cancelar(nota.referenciaEmissor, texto);
  } catch (erro) {
    if (erro instanceof ErroEmissorRecusou) throw new ErroFiscal(erro.message);
    if (erro instanceof ErroEmissorIndisponivel) throw new ErroFiscal('O emissor de NF-e não respondeu: a nota continua autorizada. Tente de novo em alguns minutos.');
    throw erro;
  }
  if (resposta.situacao === 'CANCELAMENTO_RECUSADO') throw new ErroFiscal(`A SEFAZ recusou o cancelamento: ${resposta.motivo}`);
  if (resposta.situacao !== 'CANCELADA') throw new ErroFiscal('O emissor não confirmou o cancelamento: confira a nota e tente de novo.');

  // Decisão 9: o XML do cancelamento na hora; se não vier, `nfe.consultar` busca depois.
  let xmlCancelamento: string | null = null;
  if (resposta.urlXmlCancelamento && nota.xmlCaminho) {
    try {
      const caminho = caminhoDoCancelamento(nota.xmlCaminho);
      await salvarArquivo(caminho, await emissor.baixar(resposta.urlXmlCancelamento), 'application/xml');
      xmlCancelamento = caminho;
    } catch {
      xmlCancelamento = null;
    }
  }

  await db.transaction(async (tx) => {
    const atual = await obterNota(tx, notaFiscalId, { travar: true });
    if (!atual || atual.situacao !== 'AUTORIZADA') return;
    exigirTransicaoNota({ de: 'AUTORIZADA', para: 'CANCELADA' });
    await tx
      .update(notasFiscais)
      .set({ situacao: 'CANCELADA', canceladaEm: agora, justificativaCancelamento: texto, xmlCancelamentoCaminho: xmlCancelamento, atualizadaEm: agora })
      .where(eq(notasFiscais.id, notaFiscalId));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: notaFiscalId,
      acao: 'nf_cancelada',
      de: 'AUTORIZADA',
      para: 'CANCELADA',
      usuarioId: usuario.id,
      em: agora,
      dados: { motivo: texto },
    });
    if (atual.tipo === 'DEVOLUCAO_VENDA' && atual.devolucaoId) await desfazerAutorizacaoDevolucao(tx, atual.devolucaoId, notaFiscalId, texto, usuario, agora);
    else if (atual.loteId) await portaLotes.aoCancelarRemessa(tx, atual.loteId, agora);
    if (!xmlCancelamento) {
      await obterFila().enviar('nfe.consultar', { notaFiscalId, consulta: 1 }, { tx, chaveUnica: `${notaFiscalId}:cancelamento` });
    }
  });
}

/** Spec §5.2 (CONCLUIDA → AGUARDANDO_NF) e §8.6: os itens voltam para AGUARDANDO_NF e saem do lote (porta de lotes). */
async function desfazerAutorizacaoDevolucao(
  tx: DbOuTx,
  devolucaoId: string,
  notaFiscalId: string,
  justificativa: string,
  usuario: UsuarioSessao,
  agora: Date,
): Promise<void> {
  const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId)).for('update');
  if (!d) return;
  exigirTransicao({ de: d.status, para: 'AGUARDANDO_NF', ator: 'SISTEMA' });
  const disponiveis = await tx
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'DISPONIVEL_VENDA')));
  for (const item of disponiveis) {
    exigirTransicaoItem({ de: 'DISPONIVEL_VENDA', para: 'AGUARDANDO_NF', ator: 'SISTEMA' });
    await tx.update(itensDevolucao).set({ status: 'AGUARDANDO_NF' }).where(eq(itensDevolucao.id, item.id));
    await registrarEvento(tx, {
      entidade: 'item',
      entidadeId: item.id,
      acao: 'item_status',
      de: 'DISPONIVEL_VENDA',
      para: 'AGUARDANDO_NF',
      usuarioId: usuario.id,
      em: agora,
      dados: { devolucaoId, notaFiscalId },
    });
  }
  await portaLotes.desfazerAlocacao(tx, devolucaoId, agora);
  await tx.update(devolucoes).set({ status: 'AGUARDANDO_NF', concluidaEm: null, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
  await registrarEvento(tx, {
    entidade: 'devolucao',
    entidadeId: devolucaoId,
    acao: 'devolucao_reaberta',
    de: d.status,
    para: 'AGUARDANDO_NF',
    usuarioId: usuario.id,
    em: agora,
    dados: { notaFiscalId, motivo: justificativa },
  });
}
