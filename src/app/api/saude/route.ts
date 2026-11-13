import { obterConexao } from '@/db';
import { verificarFila } from '@/modules/fila/fila';
import { verificarSaude } from '@/modules/saude/saude';

export const dynamic = 'force-dynamic';

export async function GET() {
  const resultado = await verificarSaude(obterConexao().sql, verificarFila);
  return Response.json(resultado, { status: resultado.status === 'ok' ? 200 : 503 });
}
