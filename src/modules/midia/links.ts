import { createHmac, timingSafeEqual } from 'node:crypto';

export function assinarLink(segredo: string, caminho: string, expiraEm: number): string {
  return createHmac('sha256', segredo).update(`${caminho}\n${expiraEm}`).digest('base64url');
}

export type ResultadoLink = { ok: true; caminho: string; expiraEm: number } | { ok: false; motivo: 'invalido' | 'expirado' };

/** `exp` em segundos desde 1970. A assinatura cobre o caminho e o prazo: trocar qualquer um invalida o link. */
export function verificarLink(
  segredo: string,
  p: { c: string | null; exp: string | null; sig: string | null },
  agora: Date,
): ResultadoLink {
  if (!p.c || !p.exp || !p.sig || !/^\d{1,12}$/.test(p.exp)) return { ok: false, motivo: 'invalido' };
  const expiraEm = Number(p.exp);
  const esperado = Buffer.from(assinarLink(segredo, p.c, expiraEm));
  const recebido = Buffer.from(p.sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: 'invalido' };
  if (expiraEm * 1000 <= agora.getTime()) return { ok: false, motivo: 'expirado' };
  return { ok: true, caminho: p.c, expiraEm };
}
