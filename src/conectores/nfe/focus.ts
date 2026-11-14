import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ErroEmissorIndisponivel, ErroEmissorRecusou } from './erros';
import { interpretarCancelamentoFocus, interpretarConsultaFocus, montarPayloadFocus, type RespostaFocus } from './focus-mapeamento';
import type { EmissorNFe, NotaParaEmissao, SituacaoNota } from './tipos';

/** Pesquisa focus-nfe.md §1: as rotas ficam em /v2; os arquivos (`caminho_*`) vêm como caminhos relativos ao mesmo host. */
export const URL_FOCUS: Record<AmbienteNfe, string> = {
  HOMOLOGACAO: 'https://homologacao.focusnfe.com.br',
  PRODUCAO: 'https://api.focusnfe.com.br',
};

const TEMPO_LIMITE_MS = 30_000;
const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;
/** 422 que quer dizer "este ref já foi recebido": o envio é idempotente (pesquisa §2). */
const JA_RECEBIDA = new Set(['pending_operation', 'already_processed']);

export type OpcoesFocus = { ambiente: AmbienteNfe; token: string; fetchFn?: typeof fetch; agora?: () => Date; tempoLimiteMs?: number };
type Resposta = { status: number; corpo: RespostaFocus | null };

/** Só status, `codigo`, `mensagem` e os campos: nada do payload (dados do comprador) e nunca o token. */
function descreverErro(r: Resposta): string {
  const c = r.corpo;
  const campos = (c?.erros ?? []).map((e) => [e.campo, e.mensagem].filter(Boolean).join(': ')).filter(Boolean);
  const partes = [c?.mensagem, campos.join('; ')].filter(Boolean);
  return `Focus NFe recusou (${c?.codigo ?? r.status})${partes.length > 0 ? `: ${partes.join(' ')}` : ''}`;
}

/** Cliente da Focus NFe atrás da interface EmissorNFe. Sem novas tentativas aqui: quem tenta de novo é a fila (spec §11). */
export function criarEmissorFocus(o: OpcoesFocus): EmissorNFe {
  const fetchFn = o.fetchFn ?? fetch;
  const base = URL_FOCUS[o.ambiente];
  const agora = o.agora ?? (() => new Date());
  const tempoLimite = o.tempoLimiteMs ?? TEMPO_LIMITE_MS;
  // O token é o usuário do Basic e a senha fica vazia. Nunca vai para log nem para mensagem de erro.
  const autorizacao = `Basic ${Buffer.from(`${o.token}:`).toString('base64')}`;

  async function chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<Resposta> {
    const rota = `${metodo} ${caminho.split('?')[0]}`;
    let resposta: Response;
    try {
      resposta = await fetchFn(`${base}${caminho}`, {
        method: metodo,
        headers: { authorization: autorizacao, accept: 'application/json', ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoLimite),
      });
    } catch {
      throw new ErroEmissorIndisponivel(`A Focus NFe não respondeu (${rota}).`);
    }
    const texto = await resposta.text();
    let json: RespostaFocus | null = null;
    try {
      json = texto ? (JSON.parse(texto) as RespostaFocus) : null;
    } catch {
      json = null; // o 401 vem em HTML
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroEmissorRecusou('A Focus NFe recusou o token: confira FOCUS_TOKEN_HOMOLOGACAO e FOCUS_TOKEN_PRODUCAO no .env do servidor.');
    }
    if (resposta.status === 429 || resposta.status >= 500) throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${resposta.status} (${rota}).`);
    return { status: resposta.status, corpo: json };
  }

  return {
    async emitir(nota: NotaParaEmissao): Promise<{ referencia: string }> {
      const r = await chamar('POST', `/v2/nfe?ref=${encodeURIComponent(nota.referencia)}`, montarPayloadFocus(nota, { ambiente: o.ambiente, emitidaEm: agora() }));
      if (r.status === 201 || r.status === 202) return { referencia: nota.referencia };
      if (r.status === 422 && JA_RECEBIDA.has(r.corpo?.codigo ?? '')) return { referencia: nota.referencia };
      throw new ErroEmissorRecusou(descreverErro(r));
    },

    async consultar(referencia: string): Promise<SituacaoNota> {
      const r = await chamar('GET', `/v2/nfe/${encodeURIComponent(referencia)}`);
      if (r.status === 200) return interpretarConsultaFocus(r.corpo);
      if (r.status === 404) {
        return { situacao: 'REJEITADA', codigo: null, motivo: 'A nota não está na Focus NFe (o envio não chegou lá): use "Corrigir e reenviar".' };
      }
      throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${r.status} à consulta.`);
    },

    async cancelar(referencia: string, justificativa: string): Promise<SituacaoNota> {
      const r = await chamar('DELETE', `/v2/nfe/${encodeURIComponent(referencia)}`, { justificativa });
      if (r.status === 200) return interpretarCancelamentoFocus(r.corpo);
      if ([400, 404, 415, 422].includes(r.status)) return { situacao: 'CANCELAMENTO_RECUSADO', motivo: descreverErro(r) };
      throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${r.status} ao cancelamento.`);
    },

    async baixar(url: string): Promise<Buffer> {
      const destino = url.startsWith('/') ? `${base}${url}` : url;
      if (!destino.startsWith(`${base}/`)) throw new ErroEmissorRecusou('Endereço de arquivo fora da Focus NFe.');
      let resposta: Response;
      try {
        resposta = await fetchFn(destino, { headers: { authorization: autorizacao }, signal: AbortSignal.timeout(tempoLimite) });
      } catch {
        throw new ErroEmissorIndisponivel('A Focus NFe não respondeu ao baixar o arquivo.');
      }
      if (!resposta.ok) throw new ErroEmissorIndisponivel(`A Focus NFe respondeu ${resposta.status} ao baixar o arquivo.`);
      const conteudo = Buffer.from(await resposta.arrayBuffer());
      if (conteudo.length === 0 || conteudo.length > TAMANHO_MAXIMO_ARQUIVO) throw new ErroEmissorIndisponivel('Arquivo da Focus NFe vazio ou grande demais.');
      return conteudo;
    },
  };
}
