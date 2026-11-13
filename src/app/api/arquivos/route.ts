import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { lerEnv } from '@/lib/env';
import { usuarioAtual } from '@/modules/auth/servidor';
import { discoLocal } from '@/modules/midia/armazenamento';
import { cabecalhosDoArquivo } from '@/modules/midia/cabecalhos';
import { tipoConteudoPorExtensao } from '@/modules/midia/chaves';
import { verificarLink } from '@/modules/midia/links';
import { interpretarRange } from '@/modules/midia/range';

export const dynamic = 'force-dynamic';

function texto(status: number, mensagem: string, extras: Record<string, string> = {}): Response {
  return new Response(mensagem, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "sandbox; default-src 'none'",
      ...extras,
    },
  });
}

/** Link temporário das mídias guardadas no disco (spec §9): sessão + assinatura + prazo. Responde a Range (vídeo). */
export async function GET(req: Request): Promise<Response> {
  if (!(await usuarioAtual())) return texto(401, 'Entre no sistema para ver este arquivo.');
  const p = new URL(req.url).searchParams;
  const agora = new Date();
  const link = verificarLink(lerEnv().SEGREDO_LINKS, { c: p.get('c'), exp: p.get('exp'), sig: p.get('sig') }, agora);
  if (!link.ok) {
    return link.motivo === 'expirado' ? texto(410, 'Este link expirou. Abra a evidência de novo.') : texto(403, 'Link inválido.');
  }
  let absoluto: string;
  try {
    absoluto = discoLocal().caminhoAbsoluto(link.caminho);
  } catch {
    return texto(403, 'Link inválido.');
  }
  const info = await stat(absoluto).catch(() => null);
  if (!info?.isFile()) return texto(404, 'Arquivo não encontrado.');

  const intervalo = interpretarRange(req.headers.get('range'), info.size);
  if (intervalo === 'invalido') return texto(416, 'Intervalo inválido.', { 'content-range': `bytes */${info.size}` });
  const segundosRestantes = Math.max(0, link.expiraEm - Math.floor(agora.getTime() / 1000));
  const inicio = intervalo?.inicio ?? 0;
  const fim = intervalo?.fim ?? info.size - 1;
  const corpo =
    info.size === 0
      ? null
      : (Readable.toWeb(createReadStream(absoluto, { start: inicio, end: fim })) as unknown as ReadableStream<Uint8Array>);
  return new Response(corpo, {
    status: intervalo ? 206 : 200,
    headers: {
      ...cabecalhosDoArquivo(tipoConteudoPorExtensao(link.caminho), segundosRestantes),
      'content-length': String(info.size === 0 ? 0 : fim - inicio + 1),
      'accept-ranges': 'bytes',
      ...(intervalo ? { 'content-range': `bytes ${inicio}-${fim}/${info.size}` } : {}),
    },
  });
}
