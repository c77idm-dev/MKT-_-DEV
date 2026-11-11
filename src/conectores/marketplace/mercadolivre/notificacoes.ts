import type { Db } from '@/db/client';
import { notificacoesRecebidas } from '@/db/schema';

export type NotificacaoML = { topico: string | null; recurso: string | null; payload: Record<string, unknown> };

export const LIMITE_AVISO_BYTES = 64 * 1024;

const CAMPOS_CONHECIDOS = ['id', 'resource', 'user_id', 'topic', 'application_id', 'attempts', 'sent', 'received', 'actions'] as const;

/** Lê o texto do aviso: 413 se passar do limite, 400 se não for JSON. */
export function lerAvisoML(texto: string): { ok: true; corpo: unknown } | { ok: false; status: 400 | 413 } {
  if (Buffer.byteLength(texto, 'utf8') > LIMITE_AVISO_BYTES) return { ok: false, status: 413 };
  try {
    return { ok: true, corpo: JSON.parse(texto) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

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
    payload: Object.fromEntries(CAMPOS_CONHECIDOS.filter((c) => c in p).map((c) => [c, p[c]])),
  };
}

export async function registrarNotificacao(db: Db, canal: string, n: NotificacaoML): Promise<number> {
  const [linha] = await db
    .insert(notificacoesRecebidas)
    .values({ canal, topico: n.topico, recurso: n.recurso, payload: n.payload })
    .returning({ id: notificacoesRecebidas.id });
  return linha.id;
}
