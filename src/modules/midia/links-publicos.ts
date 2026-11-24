import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Links públicos das provas do dossiê (E28, decisão do usuário de 24/11/2026): quem tiver o PDF (o analista do ML, por
 * exemplo) abre a foto ou o vídeo sem login. Diferente do link de sessão do /api/arquivos (links.ts: 10 min e sessão
 * exigida), este vale 90 dias e aponta para uma evidência pelo id, nunca para uma chave do armazenamento.
 *
 * Domínio separado: a assinatura usa uma chave derivada do SEGREDO_LINKS só para este fim. Uma assinatura de sessão não
 * abre a rota pública, e uma pública não abre a de sessão, mesmo sobre o mesmo texto.
 */

/** As rotas públicas (sem login): a foto ou o vídeo em si (com Range) e a página que toca o vídeo. */
export const CAMINHO_PROVA_ARQUIVO = '/api/provas/arquivo';
export const CAMINHO_PROVA_VIDEO = '/api/provas/video';

/** Prazo dos links públicos (E28): 90 dias. Depois disso, o PDF precisa ser gerado de novo (links novos). */
export const DURACAO_LINK_PUBLICO_SEGUNDOS = 90 * 24 * 60 * 60;

/** O rótulo da chave derivada. Trocar o rótulo invalida todos os links públicos já entregues. */
const DOMINIO = 'devolucoes:link-publico-das-provas:v1';

/** Só o id da evidência como o banco devolve (UUID em minúsculas): nada de caminho, barra ou ponto. */
const ID_EVIDENCIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** HMAC-SHA-256 em base64url, sem preenchimento. */
const ASSINATURA = /^[A-Za-z0-9_-]{43}$/;

function chavePublica(segredo: string): Buffer {
  return createHmac('sha256', segredo).update(DOMINIO).digest();
}

/** `expiraEm` em segundos desde 1970. A assinatura cobre o id e o prazo: trocar qualquer um invalida o link. */
export function assinarLinkPublico(segredo: string, evidenciaId: string, expiraEm: number): string {
  return createHmac('sha256', chavePublica(segredo)).update(`${evidenciaId}\n${expiraEm}`).digest('base64url');
}

/** Os parâmetros do link (e, exp, sig) de uma evidência, valendo 90 dias a partir de `agora`. */
export function parametrosLinkPublico(segredo: string, evidenciaId: string, agora: Date): URLSearchParams {
  if (!ID_EVIDENCIA.test(evidenciaId)) throw new Error('Link público só para id de evidência.');
  const expiraEm = Math.floor(agora.getTime() / 1000) + DURACAO_LINK_PUBLICO_SEGUNDOS;
  return new URLSearchParams({ e: evidenciaId, exp: String(expiraEm), sig: assinarLinkPublico(segredo, evidenciaId, expiraEm) });
}

export type ResultadoLinkPublico = { ok: true; evidenciaId: string; expiraEm: number } | { ok: false; motivo: 'invalido' | 'expirado' };

/**
 * Confere o formato antes da assinatura e a assinatura antes do prazo: um link adulterado é "inválido" (403), nunca
 * "expirado" (410). Um prazo além dos 90 dias (que este sistema nunca gera) também é inválido.
 */
export function verificarLinkPublico(
  segredo: string,
  p: { e: string | null; exp: string | null; sig: string | null },
  agora: Date,
): ResultadoLinkPublico {
  if (!p.e || !p.exp || !p.sig || !ID_EVIDENCIA.test(p.e) || !/^\d{1,12}$/.test(p.exp) || !ASSINATURA.test(p.sig)) {
    return { ok: false, motivo: 'invalido' };
  }
  const expiraEm = Number(p.exp);
  const esperado = Buffer.from(assinarLinkPublico(segredo, p.e, expiraEm));
  const recebido = Buffer.from(p.sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: 'invalido' };
  const agoraS = Math.floor(agora.getTime() / 1000);
  if (expiraEm > agoraS + DURACAO_LINK_PUBLICO_SEGUNDOS) return { ok: false, motivo: 'invalido' };
  if (expiraEm <= agoraS) return { ok: false, motivo: 'expirado' };
  return { ok: true, evidenciaId: p.e, expiraEm };
}
