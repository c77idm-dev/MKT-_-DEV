import { obterConexao } from '@/db';
import { verificarFila } from '@/modules/fila/fila';
import { responderSaude } from '@/modules/saude/resposta';
import { verificarSaude } from '@/modules/saude/saude';

export const dynamic = 'force-dynamic';

export async function GET() {
  // obterConexao() dentro da função: se lançar (env inválida), responderSaude devolve 503.
  return responderSaude(() => verificarSaude(obterConexao().sql, verificarFila));
}
