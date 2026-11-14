import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { gerarZipXmls } from '@/modules/fiscal/xmls-periodo';

export const dynamic = 'force-dynamic';

/** Spec §8.7 "Baixar XMLs do período" (Fiscal e Gestor). Sem nada para baixar, volta para a etapa 4 com o motivo. */
export async function GET(request: Request) {
  await exigirPermissao('gerir_fiscal');
  const url = new URL(request.url);
  const resultado = await gerarZipXmls(obterDb(), { de: url.searchParams.get('de') ?? '', ate: url.searchParams.get('ate') ?? '' });
  if (!resultado.ok) {
    return new Response(null, { status: 303, headers: { location: `/fluxo/etapa/4?xmls=${resultado.codigo}` } });
  }
  // Cópia num ArrayBuffer novo: o tipo do Response não aceita Uint8Array sobre ArrayBufferLike.
  return new Response(new Uint8Array(resultado.conteudo), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${resultado.nome}"`,
      'cache-control': 'no-store',
    },
  });
}
