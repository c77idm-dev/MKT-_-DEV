import { obterConexao } from '@/db';
import { verificarSaude } from '@/modules/saude/saude';

export const dynamic = 'force-dynamic';

export async function GET() {
  const resultado = await verificarSaude(obterConexao().sql);
  return Response.json(resultado, { status: resultado.status === 'ok' ? 200 : 503 });
}
