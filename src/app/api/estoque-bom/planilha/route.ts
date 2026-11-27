import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { gerarXlsx } from '@/modules/lotes/xlsx';
import { listarVoltaAoArmazem } from '@/modules/volta-armazem/consulta';
import { lerPeriodo, NOME_ABA, nomeArquivoVolta, planilhaVolta } from '@/modules/volta-armazem/dominio';

export const dynamic = 'force-dynamic';

/** Melhoria 4: planilha "Volta ao armazém" do período (?de=&ate=, padrão hoje). Fiscal e Gestor (acompanhar, E29). */
export async function GET(request: Request) {
  await exigirPermissao('acompanhar');
  const url = new URL(request.url);
  const periodo = lerPeriodo({ de: url.searchParams.get('de') ?? undefined, ate: url.searchParams.get('ate') ?? undefined });
  if (!periodo.valido) {
    // Período inválido não baixa: volta para a página, que mostra o motivo.
    const volta = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
    return new Response(null, { status: 303, headers: { location: `/fluxo/estoque-bom?${volta}` } });
  }
  const p = { de: periodo.de, ate: periodo.ate };
  const linhas = await listarVoltaAoArmazem(obterDb(), p);
  // Cópia num ArrayBuffer novo: o tipo do Response não aceita Uint8Array sobre ArrayBufferLike.
  return new Response(new Uint8Array(gerarXlsx(NOME_ABA, planilhaVolta(p, linhas))), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${nomeArquivoVolta(p)}"`,
      'cache-control': 'no-store',
    },
  });
}
