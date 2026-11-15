import { notFound } from 'next/navigation';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ehCodigoLote } from '@/modules/lotes/dominio';
import { ErroLotes } from '@/modules/lotes/erros';
import { carregarListaConsolidada } from '@/modules/lotes/lista-consolidada';
import { gerarPdfLista } from '@/modules/lotes/pdf';
import { gerarXlsx, planilhaDaLista } from '@/modules/lotes/xlsx';

export const dynamic = 'force-dynamic';

/** Spec §6.5 "Lista consolidada (PDF e Excel)" para o SAC do fabricante. Fiscal e Gestor. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  await exigirPermissao('gerir_fiscal');
  const { codigo } = await params;
  if (!ehCodigoLote(codigo)) notFound();
  const formato = new URL(request.url).searchParams.get('formato') === 'xlsx' ? 'xlsx' : 'pdf';
  let lista;
  try {
    lista = await carregarListaConsolidada(obterDb(), codigo, new Date());
  } catch (erro) {
    if (erro instanceof ErroLotes) return new Response(null, { status: 303, headers: { location: `/lotes/${codigo}?erro=lista` } });
    throw erro;
  }
  if (!lista) notFound();
  const conteudo = formato === 'xlsx' ? gerarXlsx('Lista consolidada', planilhaDaLista(lista)) : await gerarPdfLista(lista);
  return new Response(new Uint8Array(conteudo), {
    headers: {
      'content-type': formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      'content-disposition': `attachment; filename="lista-consolidada-${codigo}.${formato}"`,
      'cache-control': 'no-store',
    },
  });
}
