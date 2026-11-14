import { redigir } from '@/lib/redigir';
import { ErroML } from './cliente';

/** Resume o corpo de um erro da API para logs e relatórios, sem dados pessoais (spec §10). */
export function resumirCorpoErro(corpo: string, max = 300): string {
  try {
    return JSON.stringify(redigir(JSON.parse(corpo))).slice(0, max);
  } catch {
    return `[corpo não-JSON omitido: ${corpo.length} caracteres]`;
  }
}

function corpoComoObjeto(erro: ErroML): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(erro.corpo);
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Código do erro do ML: "invalid_grant", "invalid_operator_user_id", "local_rate_limited"... (suposição A13). */
export function codigoErroML(erro: unknown): string | null {
  if (!(erro instanceof ErroML)) return null;
  if (erro.corpo.includes('invalid_operator_user_id')) return 'invalid_operator_user_id';
  const corpo = corpoComoObjeto(erro);
  for (const chave of ['error', 'code'] as const) {
    const valor = corpo?.[chave];
    if (typeof valor === 'string' && valor) return valor;
  }
  return null;
}

/** Texto curto do ML (campo "message") para mostrar ao Gestor, com o código HTTP. */
export function mensagemErroML(erro: ErroML): string {
  const corpo = corpoComoObjeto(erro);
  const mensagem = typeof corpo?.message === 'string' && corpo.message ? corpo.message : codigoErroML(erro);
  return `${(mensagem ?? 'sem detalhes').slice(0, 200)} (HTTP ${erro.status})`;
}

const STATUS_DEFINITIVOS = new Set([400, 403, 404, 409, 422]);

/** Recusa que não melhora tentando de novo. O 401 e o 429 já são tratados no cliente; 5xx e rede pedem nova tentativa. */
export function ehRecusaDefinitiva(erro: unknown): erro is ErroML {
  return erro instanceof ErroML && STATUS_DEFINITIVOS.has(erro.status);
}

/** Log estruturado (JSON numa linha) de uma falha do ML. O corpo passa por resumirCorpoErro: nada do comprador vai ao log. */
export function logErroML(contexto: string, erro: unknown, extra: Record<string, unknown> = {}): void {
  const base =
    erro instanceof ErroML
      ? { status: erro.status, caminho: erro.caminho, corpo: resumirCorpoErro(erro.corpo) }
      : { mensagem: erro instanceof Error ? erro.message : String(erro) };
  console.error(JSON.stringify({ nivel: 'erro', origem: 'mercado-livre', contexto, ...base, ...extra }));
}

/** O ML não oferece este motivo de revisão para a devolução (lista de GET /returns/reasons). */
export class ErroMotivoIndisponivel extends Error {
  readonly motivo: string;
  readonly aceitos: string[];

  constructor(motivo: string, aceitos: string[]) {
    super(`O Mercado Livre não aceita o motivo ${motivo} nesta devolução. Motivos aceitos: ${aceitos.join(', ') || 'nenhum'}.`);
    this.name = 'ErroMotivoIndisponivel';
    this.motivo = motivo;
    this.aceitos = aceitos;
  }
}
