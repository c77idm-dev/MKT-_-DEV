import { eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, evidencias } from '@/db/schema';
import { chaveEvidencia } from './chaves';
import { DURACAO_LINK_SEGUNDOS, type TipoEvidencia } from './dominio';

/**
 * Rotas públicas das provas do dossiê (E28): /api/provas/arquivo (a foto ou o vídeo, com Range) e /api/provas/video
 * (a página que toca o vídeo). Sem login: quem tem o PDF abre. O link assinado (links-publicos.ts) leva só o id da
 * evidência; o arquivo vem do banco, e só abre o que já iria no dossiê.
 */
export const CAMINHO_PROVA_ARQUIVO = '/api/provas/arquivo';
export const CAMINHO_PROVA_VIDEO = '/api/provas/video';

export type ProvaPublica = { tipo: TipoEvidencia; caminho: string; codigo: string };

/**
 * A evidência que o link público pode abrir, ou null. Só uma prova de devolução (a retirada do Full não vai em
 * dossiê), PRONTA (nem em processamento nem apagada pelo prazo de guarda), no disco local (o S3 não tem rota pública:
 * o link nem é gerado) e com o caminho igual à chave dela (evidencias/{devolução}/{evidência}.jpg|mp4). Assim nenhum
 * outro arquivo da pasta das mídias abre, nem um caminho com ".." gravado no banco.
 */
export async function buscarProvaPublica(db: DbOuTx, evidenciaId: string): Promise<ProvaPublica | null> {
  const [e] = await db
    .select({
      tipo: evidencias.tipo,
      situacao: evidencias.situacaoProcessamento,
      caminho: evidencias.caminho,
      provedor: evidencias.provedor,
      devolucaoId: evidencias.devolucaoId,
      codigo: devolucoes.codigo,
    })
    .from(evidencias)
    .innerJoin(devolucoes, eq(devolucoes.id, evidencias.devolucaoId))
    .where(eq(evidencias.id, evidenciaId))
    .limit(1);
  if (!e || e.situacao !== 'PRONTA' || e.provedor !== 'disco' || !e.devolucaoId || !e.caminho) return null;
  const chave = chaveEvidencia(e.devolucaoId, evidenciaId, e.tipo === 'VIDEO_PROVA' ? 'mp4' : 'jpg');
  return e.caminho === chave ? { tipo: e.tipo, caminho: e.caminho, codigo: e.codigo } : null;
}

/**
 * O que toda resposta pública leva além dos cabeçalhos do /api/arquivos: o link (com a assinatura) não vaza pelo
 * Referer e não entra em buscador.
 */
export const CABECALHOS_PUBLICOS = { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' } as const;

/** O vídeo fica em cache só o bastante para o Range (como no link de sessão), mesmo com o link valendo 90 dias. */
export function segundosDeCache(expiraEm: number, agora: Date): number {
  return Math.max(0, Math.min(DURACAO_LINK_SEGUNDOS, expiraEm - Math.floor(agora.getTime() / 1000)));
}

export const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Página curta em pt-BR (celular primeiro), sem script. */
export function paginaPublica(p: { titulo: string; corpo: string; estilo: string }): string {
  return (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
    `<title>${escaparHtml(p.titulo)}</title><style>${p.estilo}</style></head><body>${p.corpo}</body></html>`
  );
}

const ESTILO_AVISO = 'body{font-family:system-ui,sans-serif;margin:16px;line-height:1.5;font-size:1rem;color:#1a1a1a;background:#fff}';

export const AVISOS = {
  invalido: 'Este link não é válido. Abra a foto ou o vídeo pelo link do dossiê de provas (PDF), sem mudar o endereço.',
  expirado: 'Este link expirou: os links do dossiê de provas valem 90 dias. Gere o dossiê de provas (PDF) de novo para ter links novos.',
  arquivo: 'Arquivo não encontrado. Ele pode ter sido apagado pelo prazo de guarda.',
  video: 'Vídeo não encontrado. Ele pode ter sido apagado pelo prazo de guarda.',
} as const;

/** 403, 404 e 410 das rotas públicas: a explicação em pt-BR, com o mesmo sandbox do /api/arquivos (e o estilo). */
export function avisoPublico(status: number, mensagem: string): Response {
  return new Response(paginaPublica({ titulo: 'Provas da devolução', corpo: `<p>${escaparHtml(mensagem)}</p>`, estilo: ESTILO_AVISO }), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      ...CABECALHOS_PUBLICOS,
    },
  });
}
