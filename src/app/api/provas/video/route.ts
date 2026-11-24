import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';
import { origemPublica } from '@/lib/origem-publica';
import { CAMINHO_PROVA_ARQUIVO, verificarLinkPublico } from '@/modules/midia/links-publicos';
import { AVISOS, avisoPublico, buscarProvaPublica, CABECALHOS_PUBLICOS, escaparHtml, paginaPublica } from '@/modules/midia/provas-publicas';

export const dynamic = 'force-dynamic';

const ESTILO =
  '*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#111;color:#f2f2f2}' +
  'main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:1.125rem;line-height:1.4;margin:0 0 12px}' +
  'video{display:block;width:100%;height:auto;max-height:80vh;background:#000}';

/**
 * O Vídeo de Prova pelo link público do dossiê (E28): uma página curta com o player do navegador, que toca no celular
 * e no computador sem baixar (o arquivo vem do /api/provas/arquivo, com Range). Aberto direto, o mp4 não toca: com o
 * CSP do /api/arquivos ("sandbox; default-src 'none'"), o Chrome bloqueia o próprio player do arquivo (visto no e2e).
 * O sandbox continua (sem script, sem formulário); o player só ganha o vídeo do próprio sistema (media-src) e o estilo
 * da página. A origem explícita, quando o pedido a traz (como no PDF), cobre o navegador que não trata o 'self' de uma
 * página em sandbox como o próprio sistema.
 */
export async function GET(req: Request): Promise<Response> {
  const env = lerEnv();
  const p = new URL(req.url).searchParams;
  const link = verificarLinkPublico(env.SEGREDO_LINKS, { e: p.get('e'), exp: p.get('exp'), sig: p.get('sig') }, new Date());
  if (!link.ok) return link.motivo === 'expirado' ? avisoPublico(410, AVISOS.expirado) : avisoPublico(403, AVISOS.invalido);
  const prova = await buscarProvaPublica(obterDb(), link.evidenciaId);
  if (!prova || prova.tipo !== 'VIDEO_PROVA') return avisoPublico(404, AVISOS.video);

  const arquivo = `${CAMINHO_PROVA_ARQUIVO}?${new URLSearchParams({ e: link.evidenciaId, exp: String(link.expiraEm), sig: p.get('sig') ?? '' })}`;
  const titulo = `Vídeo de Prova · ${prova.codigo}`;
  const html = paginaPublica({
    titulo,
    estilo: ESTILO,
    corpo:
      `<main><h1>${escaparHtml(titulo)}</h1>` +
      `<video controls playsinline preload="metadata" src="${escaparHtml(arquivo)}">Este navegador não consegue tocar o vídeo.</video></main>`,
  });
  const origem = origemPublica(req.headers, env);
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': `sandbox; default-src 'none'; media-src 'self'${origem ? ` ${origem}` : ''}; style-src 'unsafe-inline'`,
      ...CABECALHOS_PUBLICOS,
    },
  });
}
