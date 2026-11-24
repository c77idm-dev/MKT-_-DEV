import { notFound } from 'next/navigation';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';
import { avaliarOrigemPublica } from '@/lib/origem-publica';
import { exigirPermissao } from '@/modules/auth/servidor';
import { cookieDossiePronto, ehMarcaDossie, MENSAGEM_CONFERENCIA_PENDENTE, normalizarCodigoDossie } from '@/modules/dossie/dominio';
import { gerarDossie, type ResultadoDossie } from '@/modules/dossie/gerar';
import { ErroFilaCheia, ErroPrazoEsgotado } from '@/modules/dossie/serie';

export const dynamic = 'force-dynamic';

/** Como na rota /api/arquivos: nada daqui roda na origem do app nem tem o tipo adivinhado pelo navegador. */
const SEGURANCA = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'" };

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Página curta em pt-BR para o que o toque no botão pode abrir em vez do download (409 e 503). No app instalado
 * (standalone) não há o "Voltar" do navegador: o link leva de volta à devolução.
 */
function aviso(status: number, mensagem: string, codigo: string, extras: Record<string, string> = {}): Response {
  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Dossiê de provas</title></head>' +
    '<body style="font-family:system-ui,sans-serif;margin:16px;line-height:1.5">' +
    `<p>${escapar(mensagem)}</p><p><a href="/fluxo/devolucoes/${escapar(codigo)}">Voltar para a devolução ${escapar(codigo)}</a></p>` +
    '</body></html>';
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...SEGURANCA,
      'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      ...extras,
    },
  });
}

/**
 * Dossiê de provas (PDF) (extra, 19/11/2026): tudo da devolução num arquivo só, para anexar na resposta ao ML.
 * A permissão vem antes de qualquer leitura (como a página do detalhe): sem sessão vai ao login; sem permissão, 404.
 * Pedido de outro site (Sec-Fetch-Site: cross-site), 403: a rota grava no histórico e gasta a única vCPU.
 * Antes do fim da conferência, 409. Fila cheia ou prazo estourado, 503 com Retry-After. O pedido que foi embora
 * (request.signal) cancela a geração e nada é registrado. O tamanho final vai no cabeçalho X-Dossie-Tamanho (bytes).
 * Os links públicos das fotos e do vídeo (E28) usam o endereço público tirado deste pedido (avaliarOrigemPublica: o Host
 * e o X-Forwarded-Proto do nginx, conferidos); sem ele, o PDF sai sem links e o motivo vai para o log.
 */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const usuario = await exigirPermissao('ver_listas');
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response('Pedido de outro site recusado.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', ...SEGURANCA } });
  }
  const codigo = normalizarCodigoDossie((await params).codigo);
  if (!codigo) notFound();
  let r: ResultadoDossie;
  try {
    r = await gerarDossie(obterDb(), codigo, usuario, { sinal: request.signal, origem: avaliarOrigemPublica(request.headers, lerEnv()) });
  } catch (erro) {
    // 499: quem pediu fechou a conexão; ninguém lê esta resposta.
    if (request.signal.aborted) return new Response(null, { status: 499, headers: SEGURANCA });
    if (erro instanceof ErroFilaCheia) {
      return aviso(503, 'Outro dossiê está sendo gerado. Tente de novo em instantes.', codigo, { 'retry-after': '30' });
    }
    if (erro instanceof ErroPrazoEsgotado) {
      return aviso(503, 'O dossiê demorou demais para ficar pronto. Tente de novo em instantes.', codigo, { 'retry-after': '30' });
    }
    throw erro;
  }
  if (r.tipo === 'nao_encontrada') notFound();
  if (r.tipo === 'conferencia_pendente') return aviso(409, MENSAGEM_CONFERENCIA_PENDENTE, codigo);
  const marca = new URL(request.url).searchParams.get('n');
  return new Response(new Uint8Array(r.pdf.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${r.nomeArquivo}"`,
      'content-length': String(r.pdf.tamanho),
      'x-dossie-tamanho': String(r.pdf.tamanho),
      ...SEGURANCA,
      // O botão espera este cookie para encerrar o "Gerando…" (BotaoDossie.tsx); não guarda nada de sigiloso.
      ...(ehMarcaDossie(marca) ? { 'set-cookie': `${cookieDossiePronto(marca)}=1; Max-Age=120; Path=/; SameSite=Lax` } : {}),
    },
  });
}

/** HEAD (prévia de link, gerenciador de downloads): sem isto o Next responde chamando o GET, que gera o PDF e grava o evento. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: 'GET', ...SEGURANCA } });
}
