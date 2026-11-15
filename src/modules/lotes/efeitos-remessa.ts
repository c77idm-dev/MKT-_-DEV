import { eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { lotes } from '@/db/schema';
import { registrarEvento } from '@/modules/historico/eventos';
import { ROTULO_STATUS_LOTE } from './dominio';
import { ErroLotes } from './erros';
import { obterLote } from './repositorio';
import { exigirTransicaoLote } from './transicoes-lote';

/** FECHADO → NF_EMITIDA, na transação da autorização da NF de Remessa. */
export async function aoAutorizarRemessa(tx: DbOuTx, loteId: string, notaFiscalId: string, agora: Date): Promise<void> {
  const lote = await obterLote(tx, loteId, { travar: true });
  if (!lote) throw new ErroLotes('Lote não encontrado.');
  // Erro técnico (não deve acontecer): a tarefa nfe.consultar tenta de novo e, no limite, vai para Falhas.
  if (lote.status !== 'FECHADO') {
    throw new Error(`Lote ${lote.codigo} está ${lote.status} ao autorizar a NF de Remessa ${notaFiscalId}; esperado FECHADO.`);
  }
  exigirTransicaoLote({ de: 'FECHADO', para: 'NF_EMITIDA', ator: 'SISTEMA' });
  await tx.update(lotes).set({ status: 'NF_EMITIDA', notaFiscalId, atualizadoEm: agora }).where(eq(lotes.id, loteId));
  await registrarEvento(tx, {
    entidade: 'lote',
    entidadeId: loteId,
    acao: 'nf_autorizada',
    de: 'FECHADO',
    para: 'NF_EMITIDA',
    usuarioId: null,
    em: agora,
    dados: { notaFiscalId },
  });
}

/** NF_EMITIDA → FECHADO. Com o envio já registrado (decisão 13), a SEFAZ já cancelou: não lança, deixa o alerta no lote. */
export async function aoCancelarRemessa(tx: DbOuTx, loteId: string, agora: Date): Promise<void> {
  const lote = await obterLote(tx, loteId, { travar: true });
  if (!lote) return;
  if (lote.status === 'NF_EMITIDA') {
    exigirTransicaoLote({ de: 'NF_EMITIDA', para: 'FECHADO', ator: 'SISTEMA' });
    await tx.update(lotes).set({ status: 'FECHADO', notaFiscalId: null, atualizadoEm: agora }).where(eq(lotes.id, loteId));
    await registrarEvento(tx, {
      entidade: 'lote',
      entidadeId: loteId,
      acao: 'nf_cancelada',
      de: 'NF_EMITIDA',
      para: 'FECHADO',
      usuarioId: null,
      em: agora,
      dados: { notaFiscalId: lote.notaFiscalId },
    });
    return;
  }
  if (lote.status === 'ENVIADO' || lote.status === 'FINALIZADO') {
    await registrarEvento(tx, {
      entidade: 'lote',
      entidadeId: loteId,
      acao: 'lote_alerta_nf_cancelada',
      usuarioId: null,
      em: agora,
      dados: {
        notaFiscalId: lote.notaFiscalId,
        loteStatus: lote.status,
        mensagem: `A NF de Remessa foi cancelada com o lote ${lote.codigo} já ${ROTULO_STATUS_LOTE[lote.status].toLowerCase()}. Confira com o contador.`,
      },
    });
  }
}
