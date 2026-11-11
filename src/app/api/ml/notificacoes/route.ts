import { aceitarNotificacaoML, LIMITE_AVISO_BYTES, lerAvisoML, registrarNotificacao } from '@/conectores/marketplace/mercadolivre/notificacoes';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** O ML exige HTTP 200 em menos de 500 ms (spec §7.2): só grava o aviso e responde. */
export async function POST(requisicao: Request) {
  const declarado = Number(requisicao.headers.get('content-length'));
  if (requisicao.headers.has('content-length') && declarado > LIMITE_AVISO_BYTES) return new Response(null, { status: 413 });
  const lido = lerAvisoML(await requisicao.text());
  if (!lido.ok) return new Response(null, { status: lido.status });
  const notificacao = aceitarNotificacaoML(lido.corpo, lerEnv().ML_CLIENT_ID || undefined);
  if (notificacao) await registrarNotificacao(obterDb(), 'mercado_livre', notificacao);
  return new Response(null, { status: 200 });
}
