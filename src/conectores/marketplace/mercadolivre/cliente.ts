export const API_ML = 'https://api.mercadolibre.com';

export class ErroML extends Error {
  readonly status: number;
  /** Não enumerável: o pg-boss grava o erro em job.output copiando as chaves próprias, e o corpo cru pode ter dados do comprador. */
  declare readonly corpo: string;
  readonly caminho: string;

  constructor(status: number, corpo: string, caminho: string) {
    super(`Mercado Livre respondeu ${status} em ${caminho}`);
    this.name = 'ErroML';
    this.status = status;
    Object.defineProperty(this, 'corpo', { value: corpo, enumerable: false });
    this.caminho = caminho;
  }
}

export type ArquivoML = { nome: string; conteudo: Buffer; tipoConteudo: string };

export type ClienteML = {
  get<T = unknown>(caminho: string, cabecalhos?: Record<string, string>): Promise<T>;
  getTexto(caminho: string, cabecalhos?: Record<string, string>): Promise<string>;
  post<T = unknown>(caminho: string, corpo: unknown): Promise<T>;
  postArquivo<T = unknown>(caminho: string, arquivo: ArquivoML): Promise<T>;
};

export type OpcoesClienteML = {
  /** Token fixo (scripts da Fase 0) ou função que devolve um token válido (renova quando falta pouco). */
  accessToken: string | (() => Promise<string>);
  /** Chamada uma vez quando o ML responde 401: recebe o token recusado e devolve um novo. */
  renovarToken?: (recusado: string) => Promise<string>;
  fetchFn?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
  timeoutMs?: number;
};

/** Spec §7.2: o 429 (`local_rate_limited`) pede nova tentativa com espera crescente e jitter. */
export const NOVAS_TENTATIVAS_429 = 3;

export function esperaDo429(tentativa: number, retryAfter: string | null, aleatorio: () => number): number {
  if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) return Math.min(Number(retryAfter) * 1000, 30_000);
  return Math.min(500 * 2 ** tentativa, 8_000) + Math.floor(aleatorio() * 250);
}

type Revisor = (chave: string, valor: unknown, contexto?: { source?: string }) => unknown;

/** Inteiro além de 2^53 (ids do ML com mais de 15 dígitos) vira texto, sem perder dígitos. O Node 24 passa `contexto.source`. */
const preservarInteirosGrandes: Revisor = (_chave, valor, contexto) =>
  typeof valor === 'number' && Number.isInteger(valor) && !Number.isSafeInteger(valor) && contexto?.source && /^-?\d+$/.test(contexto.source)
    ? contexto.source
    : valor;

export function analisarJson(texto: string): unknown {
  return JSON.parse(texto, preservarInteirosGrandes as Parameters<typeof JSON.parse>[1]);
}

export function criarClienteML(p: OpcoesClienteML): ClienteML {
  const fetchFn = p.fetchFn ?? fetch;
  const esperar = p.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const aleatorio = p.aleatorio ?? Math.random;
  const timeoutMs = p.timeoutMs ?? 20_000;
  const fixo = p.accessToken;
  const tokenAtual = typeof fixo === 'string' ? async () => fixo : fixo;

  async function chamar(caminho: string, montar: (token: string) => RequestInit): Promise<{ status: number; texto: string }> {
    let token = await tokenAtual();
    let renovou = false;
    for (let tentativa = 0; ; tentativa += 1) {
      const resposta = await fetchFn(`${API_ML}${caminho}`, { ...montar(token), signal: AbortSignal.timeout(timeoutMs) });
      const texto = await resposta.text();
      if (resposta.status === 429 && tentativa < NOVAS_TENTATIVAS_429) {
        await esperar(esperaDo429(tentativa, resposta.headers.get('retry-after'), aleatorio));
        continue;
      }
      if (resposta.status === 401 && p.renovarToken && !renovou) {
        renovou = true;
        token = await p.renovarToken(token);
        continue;
      }
      if (!resposta.ok) throw new ErroML(resposta.status, texto, caminho);
      return { status: resposta.status, texto };
    }
  }

  function json<T>(r: { status: number; texto: string }, caminho: string): T {
    if (!r.texto) return null as T;
    try {
      return analisarJson(r.texto) as T;
    } catch {
      throw new ErroML(r.status, r.texto, caminho);
    }
  }

  function cabecalhos(token: string, extra: Record<string, string> = {}): Record<string, string> {
    return { accept: 'application/json', ...extra, authorization: `Bearer ${token}` };
  }

  return {
    async get<T = unknown>(caminho: string, extra: Record<string, string> = {}): Promise<T> {
      return json<T>(await chamar(caminho, (token) => ({ headers: cabecalhos(token, extra) })), caminho);
    },
    async getTexto(caminho: string, extra: Record<string, string> = {}): Promise<string> {
      return (await chamar(caminho, (token) => ({ headers: cabecalhos(token, extra) }))).texto;
    },
    async post<T = unknown>(caminho: string, corpo: unknown): Promise<T> {
      const resposta = await chamar(caminho, (token) => ({
        method: 'POST',
        headers: cabecalhos(token, { 'content-type': 'application/json' }),
        body: JSON.stringify(corpo),
      }));
      return json<T>(resposta, caminho);
    },
    async postArquivo<T = unknown>(caminho: string, arquivo: ArquivoML): Promise<T> {
      const resposta = await chamar(caminho, (token) => {
        // Um FormData novo a cada tentativa: o corpo de uma requisição não pode ser reenviado.
        const formulario = new FormData();
        formulario.append('file', new Blob([new Uint8Array(arquivo.conteudo)], { type: arquivo.tipoConteudo }), arquivo.nome);
        return { method: 'POST', headers: cabecalhos(token), body: formulario };
      });
      return json<T>(resposta, caminho);
    },
  };
}
