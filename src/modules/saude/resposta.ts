import type { ResultadoSaude } from './saude';

const headers = { 'Cache-Control': 'no-store' };

/** 200 se banco e fila respondem; 503 em qualquer falha, inclusive da própria verificação (decisão 16). */
export async function responderSaude(verificar: () => Promise<ResultadoSaude>): Promise<Response> {
  try {
    const r = await verificar();
    return Response.json(r, { status: r.status === 'ok' ? 200 : 503, headers });
  } catch {
    return Response.json({ status: 'erro', banco: 'falhou', fila: 'falhou' }, { status: 503, headers });
  }
}
