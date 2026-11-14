import { and, eq, isNull } from 'drizzle-orm';
import { idReclamacaoDoRecurso, type NotificacaoML } from '@/conectores/marketplace/mercadolivre/notificacoes';
import type { DbOuTx } from '@/db/client';
import { contasMarketplace, notificacoesRecebidas } from '@/db/schema';
import type { Fila } from '@/modules/fila/fila';

export const CANAL_NOTIFICACAO_ML = 'mercado_livre';

/**
 * Chave única na fila. A chave é o id fixo do job (contrato §10, E4): sem o minuto, a reclamação só sincronizaria
 * uma vez enquanto o job existisse. Com ele, o mesmo aviso repetido (ou aviso + varredura) no mesmo minuto não empilha,
 * e um aviso novo depois disso sincroniza de novo.
 */
export function chaveTarefaReclamacao(reclamacaoId: string, agora: Date = new Date()): string {
  return `ml-reclamacao-${reclamacaoId}-${Math.floor(agora.getTime() / 60_000)}`;
}

/**
 * Spec §7.2: grava o aviso e, se for de uma reclamação de um vendedor conectado, enfileira a sincronização na mesma
 * transação. O conteúdo do aviso é só gatilho: a tarefa busca a reclamação de novo na API.
 */
export async function receberNotificacaoML(db: DbOuTx, fila: Fila, n: NotificacaoML): Promise<{ id: number; enfileirada: boolean }> {
  const reclamacaoId = idReclamacaoDoRecurso(n.recurso);
  const usuarioDoAviso = n.payload.user_id;
  const vendedor = typeof usuarioDoAviso === 'number' || typeof usuarioDoAviso === 'string' ? String(usuarioDoAviso) : null;
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(notificacoesRecebidas)
      .values({ canal: CANAL_NOTIFICACAO_ML, topico: n.topico, recurso: n.recurso, payload: n.payload, referenciaExterna: reclamacaoId })
      .returning({ id: notificacoesRecebidas.id });
    if (!reclamacaoId || !vendedor) return { id: linha.id, enfileirada: false };
    const [conta] = await tx
      .select({ id: contasMarketplace.id })
      .from(contasMarketplace)
      .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), eq(contasMarketplace.sellerId, vendedor)))
      .limit(1);
    if (!conta) return { id: linha.id, enfileirada: false };
    await fila.enviar('ml.sincronizar-reclamacao', { claimId: reclamacaoId }, { tx, chaveUnica: chaveTarefaReclamacao(reclamacaoId) });
    return { id: linha.id, enfileirada: true };
  });
}

export async function marcarNotificacoesProcessadas(db: DbOuTx, reclamacaoId: string, agora: Date): Promise<number> {
  const linhas = await db
    .update(notificacoesRecebidas)
    .set({ processadaEm: agora })
    .where(
      and(
        eq(notificacoesRecebidas.canal, CANAL_NOTIFICACAO_ML),
        eq(notificacoesRecebidas.referenciaExterna, reclamacaoId),
        isNull(notificacoesRecebidas.processadaEm),
      ),
    )
    .returning({ id: notificacoesRecebidas.id });
  return linhas.length;
}
