import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';
import { discoLocal } from '@/modules/midia/armazenamento';
import { cabecalhosDoArquivo } from '@/modules/midia/cabecalhos';
import { tipoConteudoPorExtensao } from '@/modules/midia/chaves';
import { verificarLinkPublico } from '@/modules/midia/links-publicos';
import { AVISOS, avisoPublico, buscarProvaPublica, CABECALHOS_PUBLICOS, segundosDeCache } from '@/modules/midia/provas-publicas';
import { interpretarRange } from '@/modules/midia/range';

export const dynamic = 'force-dynamic';

/**
 * A foto ou o vídeo de uma prova do dossiê pelo link público (E28): sem login, com a assinatura e o prazo de 90 dias do
 * link (links-publicos.ts). Responde a Range (206), como o /api/arquivos, para o vídeo tocar no navegador sem baixar
 * inteiro. Os cabeçalhos de segurança são os do /api/arquivos (nosniff, CSP sandbox), mais o Referrer-Policy e o
 * X-Robots-Tag. Adulterado, 403; vencido, 410 (gere o PDF de novo); o que não é prova pronta no disco, 404.
 */
async function responder(req: Request, comCorpo: boolean): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const agora = new Date();
  const link = verificarLinkPublico(lerEnv().SEGREDO_LINKS, { e: p.get('e'), exp: p.get('exp'), sig: p.get('sig') }, agora);
  if (!link.ok) return link.motivo === 'expirado' ? avisoPublico(410, AVISOS.expirado) : avisoPublico(403, AVISOS.invalido);
  const prova = await buscarProvaPublica(obterDb(), link.evidenciaId);
  if (!prova) return avisoPublico(404, AVISOS.arquivo);
  let absoluto: string;
  try {
    // Confere de novo que a chave fica dentro do MIDIA_DIR (sem "..", sem barra inicial).
    absoluto = discoLocal().caminhoAbsoluto(prova.caminho);
  } catch {
    return avisoPublico(404, AVISOS.arquivo);
  }
  const info = await stat(absoluto).catch(() => null);
  if (!info?.isFile()) return avisoPublico(404, AVISOS.arquivo);

  const intervalo = interpretarRange(req.headers.get('range'), info.size);
  if (intervalo === 'invalido') {
    return new Response('Intervalo inválido.', {
      status: 416,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "sandbox; default-src 'none'",
        'x-content-type-options': 'nosniff',
        'content-range': `bytes */${info.size}`,
        ...CABECALHOS_PUBLICOS,
      },
    });
  }
  const inicio = intervalo?.inicio ?? 0;
  const fim = intervalo?.fim ?? info.size - 1;
  const corpo =
    !comCorpo || info.size === 0
      ? null
      : (Readable.toWeb(createReadStream(absoluto, { start: inicio, end: fim })) as unknown as ReadableStream<Uint8Array>);
  return new Response(corpo, {
    status: intervalo ? 206 : 200,
    headers: {
      ...cabecalhosDoArquivo(tipoConteudoPorExtensao(prova.caminho), segundosDeCache(link.expiraEm, agora)),
      ...CABECALHOS_PUBLICOS,
      'content-length': String(info.size === 0 ? 0 : fim - inicio + 1),
      'accept-ranges': 'bytes',
      ...(intervalo ? { 'content-range': `bytes ${inicio}-${fim}/${info.size}` } : {}),
    },
  });
}

export function GET(req: Request): Promise<Response> {
  return responder(req, true);
}

/** Sem isto o Next responderia o HEAD chamando o GET, que abriria o arquivo só para descartar. */
export function HEAD(req: Request): Promise<Response> {
  return responder(req, false);
}
