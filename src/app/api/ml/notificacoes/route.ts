import { aceitarNotificacaoML, LIMITE_AVISO_BYTES, lerAvisoML } from '@/conectores/marketplace/mercadolivre/notificacoes';
import { obterDb } from '@/db';
import { criarLimitador, ipDaRequisicao } from '@/lib/limite-taxa';
import { obterFila } from '@/modules/fila/fila';
import { configML } from '@/modules/mercado-livre/config';
import { receberNotificacaoML } from '@/modules/mercado-livre/notificacoes';

export const dynamic = 'force-dynamic';

/** Endpoint público: limite por IP (pendência da Fase 0). O ML manda poucos avisos por minuto; 600 é folga larga. */
const limitador = criarLimitador({ maximo: 600, janelaMs: 60_000 });

/** O ML exige HTTP 200 em menos de 500 ms (spec §7.2): grava o aviso, enfileira a sincronização e responde. */
export async function POST(requisicao: Request) {
  if (!limitador.permitir(ipDaRequisicao(requisicao.headers))) return new Response(null, { status: 429, headers: { 'retry-after': '60' } });
  const declarado = Number(requisicao.headers.get('content-length'));
  if (requisicao.headers.has('content-length') && declarado > LIMITE_AVISO_BYTES) return new Response(null, { status: 413 });
  const lido = lerAvisoML(await requisicao.text());
  if (!lido.ok) return new Response(null, { status: lido.status });
  const notificacao = aceitarNotificacaoML(lido.corpo, configML().clientId || undefined);
  if (notificacao) await receberNotificacaoML(obterDb(), obterFila(), notificacao);
  return new Response(null, { status: 200 });
}
