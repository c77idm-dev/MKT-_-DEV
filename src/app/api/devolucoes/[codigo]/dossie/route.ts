import { notFound } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { MENSAGEM_CONFERENCIA_PENDENTE, normalizarCodigoDossie } from '@/modules/dossie/dominio';
import { gerarDossie } from '@/modules/dossie/gerar';

export const dynamic = 'force-dynamic';

/**
 * Dossiê de provas (PDF) (extra, 19/11/2026): tudo da devolução num arquivo só, para anexar na resposta ao ML.
 * A permissão vem antes de qualquer leitura (como a página do detalhe): sem sessão vai ao login; sem permissão, 404.
 * Antes do fim da conferência, 409. O tamanho final vai no cabeçalho X-Dossie-Tamanho (bytes).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const usuario = await exigirPermissao('ver_listas');
  const codigo = normalizarCodigoDossie((await params).codigo);
  if (!codigo) notFound();
  const r = await gerarDossie(obterDb(), codigo, usuario);
  if (r.tipo === 'nao_encontrada') notFound();
  if (r.tipo === 'conferencia_pendente') {
    return new Response(MENSAGEM_CONFERENCIA_PENDENTE, {
      status: 409,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(new Uint8Array(r.pdf.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${r.nomeArquivo}"`,
      'content-length': String(r.pdf.tamanho),
      'cache-control': 'no-store',
      'x-dossie-tamanho': String(r.pdf.tamanho),
    },
  });
}
