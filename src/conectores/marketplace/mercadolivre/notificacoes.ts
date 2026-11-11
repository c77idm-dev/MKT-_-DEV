import type { Db } from '@/db/client';
import { notificacoesRecebidas } from '@/db/schema';

export type NotificacaoML = { topico: string | null; recurso: string | null; payload: Record<string, unknown> };

/**
 * Filtra o corpo recebido. O conteúdo é usado só como gatilho: a Fase 3 sempre busca o recurso de novo na API (spec §7.2).
 * Com o client_id configurado, ignora avisos de outros apps.
 */
export function aceitarNotificacaoML(corpo: unknown, clientIdEsperado?: string): NotificacaoML | null {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) return null;
  const p = corpo as Record<string, unknown>;
  if (clientIdEsperado && String(p.application_id ?? '') !== clientIdEsperado) return null;
  return {
    topico: typeof p.topic === 'string' ? p.topic : null,
    recurso: typeof p.resource === 'string' ? p.resource : null,
    payload: p,
  };
}

export async function registrarNotificacao(db: Db, canal: string, n: NotificacaoML): Promise<number> {
  const [linha] = await db
    .insert(notificacoesRecebidas)
    .values({ canal, topico: n.topico, recurso: n.recurso, payload: n.payload })
    .returning({ id: notificacoesRecebidas.id });
  return linha.id;
}
