import { aceitarNotificacaoML, registrarNotificacao } from '@/conectores/marketplace/mercadolivre/notificacoes';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** O ML exige HTTP 200 em menos de 500 ms (spec §7.2): só grava o aviso e responde. */
export async function POST(requisicao: Request) {
  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const notificacao = aceitarNotificacaoML(corpo, lerEnv().ML_CLIENT_ID || undefined);
  if (notificacao) await registrarNotificacao(obterDb(), 'mercado_livre', notificacao);
  return new Response(null, { status: 200 });
}
