import { z } from 'zod';
import { analisarJson, ErroML, esperaDo429, NOVAS_TENTATIVAS_429, type ClienteML } from '../mercadolivre/cliente';

/** Rotas do Bitbrain para o sistema de devoluções (contrato: docs/integracao/bitbrain-rota-devolucoes.md). */
export const CAMINHO_EMPRESAS = '/integracao/devolucoes/empresas';
export const CAMINHO_ML = '/integracao/devolucoes/ml';
/** Ao abrir Configurações › Mercado Livre, a lista de contas não pode segurar a tela por muito tempo (D13). */
export const TIMEOUT_EMPRESAS_MS = 5_000;
/** D20: o limite da rota (DEVOLUCOES_RPM) responde 429 com Retry-After: 60; o cliente do ML para em 30 s. */
export const ESPERA_MAXIMA_BITBRAIN_MS = 60_000;

export const MENSAGEM_RESPOSTA_MANUAL = 'No modo Bitbrain o sistema não escreve no Mercado Livre: responda no ML à mão.';

/** B2: a rota só lê. Ninguém deve chamar post/postArquivo no modo bitbrain; se chamar, o erro explica. */
export class ErroRespostaManual extends Error {
  constructor() {
    super(MENSAGEM_RESPOSTA_MANUAL);
    this.name = 'ErroRespostaManual';
  }
}

export type MotivoErroBitbrain = 'token' | 'caminho' | 'empresa' | 'fora_do_ar' | 'formato';
const MENSAGEM_TOKEN = 'Bitbrain recusou: confira o BITBRAIN_TOKEN';

function mensagem(status: number, motivo: MotivoErroBitbrain, empresa: string | null, caminho: string | null): string {
  switch (motivo) {
    case 'token':
      return `${MENSAGEM_TOKEN} (HTTP ${status}).`;
    case 'caminho':
      return `${MENSAGEM_TOKEN} (HTTP ${status}, caminho não permitido: ${caminho ?? '?'}).`;
    case 'empresa':
      return `O Bitbrain não tem a conta do ML da empresa ${empresa ?? '?'} (HTTP ${status}).`;
    case 'fora_do_ar':
      return `O Bitbrain não respondeu (HTTP ${status}). Confira se a rota de devoluções está ligada.`;
    case 'formato':
      return 'A resposta do Bitbrain veio fora do formato esperado.';
  }
}

/** Recusa da própria rota do Bitbrain (corpo {"erro": ...}), e não do ML (D5). Não é ErroML: a tarefa lança e vai para Falhas. */
export class ErroBitbrain extends Error {
  readonly status: number;
  readonly motivo: MotivoErroBitbrain;
  readonly empresa: string | null;

  constructor(status: number, motivo: MotivoErroBitbrain, empresa: string | null, caminho: string | null = null) {
    super(mensagem(status, motivo, empresa, caminho));
    this.name = 'ErroBitbrain';
    this.status = status;
    this.motivo = motivo;
    this.empresa = empresa;
  }
}

export type OpcoesBitbrain = { url: string; token: string; fetchFn?: typeof fetch; timeoutMs?: number };
export type OpcoesClienteBitbrain = OpcoesBitbrain & { empresa: string; esperar?: (ms: number) => Promise<void>; aleatorio?: () => number };

const semBarraFinal = (url: string) => url.replace(/\/+$/, '');
const semQuery = (caminho: string) => caminho.split('?')[0];

function cabecalhos(token: string): Record<string, string> {
  return { accept: 'application/json, application/xml', authorization: `Bearer ${token}` };
}

/** O texto de {"erro": "..."} da própria rota; null quando o corpo é do ML (que usa message/error). */
function erroDaRota(texto: string): string | null {
  try {
    const valor: unknown = JSON.parse(texto);
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && typeof (valor as { erro?: unknown }).erro === 'string') {
      return (valor as { erro: string }).erro;
    }
  } catch {
    // corpo que não é JSON: é do ML (ou de um proxy) e segue como ErroML
  }
  return null;
}

/**
 * ClienteML pela rota do Bitbrain (B1): a mesma interface do cliente do ML, então o ConectorML, os esquemas e o
 * mapeamento não mudam. Os cabeçalhos extras (x-format-new, accept XML) não vão: o Bitbrain sabe o que mandar ao ML.
 */
export function criarClienteViaBitbrain(p: OpcoesClienteBitbrain): ClienteML {
  const fetchFn = p.fetchFn ?? fetch;
  const esperar = p.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const aleatorio = p.aleatorio ?? Math.random;
  const timeoutMs = p.timeoutMs ?? 20_000;
  const base = semBarraFinal(p.url);

  async function chamar(caminho: string): Promise<{ status: number; texto: string }> {
    const url = `${base}${CAMINHO_ML}?${new URLSearchParams({ empresa: p.empresa, caminho })}`;
    const paraLog = semQuery(caminho);
    for (let tentativa = 0; ; tentativa += 1) {
      const resposta = await fetchFn(url, { headers: cabecalhos(p.token), signal: AbortSignal.timeout(timeoutMs) });
      const texto = await resposta.text();
      if (resposta.status === 429 && tentativa < NOVAS_TENTATIVAS_429) {
        await esperar(esperaDo429(tentativa, resposta.headers.get('retry-after'), aleatorio, ESPERA_MAXIMA_BITBRAIN_MS));
        continue;
      }
      if (resposta.ok) return { status: resposta.status, texto };
      if (erroDaRota(texto) !== null) {
        if (resposta.status === 401) throw new ErroBitbrain(401, 'token', p.empresa);
        if (resposta.status === 403) throw new ErroBitbrain(403, 'caminho', p.empresa, paraLog);
        if (resposta.status === 404) throw new ErroBitbrain(404, 'empresa', p.empresa);
      }
      throw new ErroML(resposta.status, texto, paraLog, p.empresa);
    }
  }

  function json<T>(r: { status: number; texto: string }, caminho: string): T {
    if (!r.texto) return null as T;
    try {
      return analisarJson(r.texto) as T;
    } catch {
      throw new ErroML(r.status, r.texto, semQuery(caminho), p.empresa);
    }
  }

  return {
    async get<T = unknown>(caminho: string): Promise<T> {
      return json<T>(await chamar(caminho), caminho);
    },
    async getTexto(caminho: string): Promise<string> {
      return (await chamar(caminho)).texto;
    },
    async post<T = unknown>(): Promise<T> {
      throw new ErroRespostaManual();
    },
    async postArquivo<T = unknown>(): Promise<T> {
      throw new ErroRespostaManual();
    },
  };
}

const esquemaEmpresas = z.object({
  empresas: z.array(
    z.looseObject({
      empresa: z.string().trim().min(1).max(100),
      nome: z.string().trim().max(200).catch(''),
      seller_id: z.union([z.string().trim().min(1), z.number().int()]).transform(String),
    }),
  ),
});

export type EmpresaBitbrain = { empresa: string; nome: string; sellerId: string };

/** GET /integracao/devolucoes/empresas: as contas do ML com credencial válida no Bitbrain (§4.3). */
export async function listarEmpresasBitbrain(p: OpcoesBitbrain): Promise<EmpresaBitbrain[]> {
  const resposta = await (p.fetchFn ?? fetch)(`${semBarraFinal(p.url)}${CAMINHO_EMPRESAS}`, {
    headers: cabecalhos(p.token),
    signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_EMPRESAS_MS),
  });
  const texto = await resposta.text();
  if (resposta.status === 401) throw new ErroBitbrain(401, 'token', null);
  if (!resposta.ok) throw new ErroBitbrain(resposta.status, 'fora_do_ar', null);
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroBitbrain(resposta.status, 'formato', null);
  }
  const lido = esquemaEmpresas.safeParse(corpo);
  if (!lido.success) throw new ErroBitbrain(resposta.status, 'formato', null);
  const unicas = new Map<string, EmpresaBitbrain>();
  for (const e of lido.data.empresas) {
    if (!unicas.has(e.empresa)) unicas.set(e.empresa, { empresa: e.empresa, nome: e.nome || e.empresa, sellerId: e.seller_id });
  }
  return [...unicas.values()];
}
