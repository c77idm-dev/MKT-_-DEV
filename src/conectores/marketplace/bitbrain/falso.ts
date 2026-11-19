import { TOKEN_BITBRAIN_FALSO, URL_BITBRAIN_FALSO } from '@/lib/env';
import { API_ML } from '../mercadolivre/cliente';
import { fetchFalsoML, PREFIXO_TOKEN_FALSO } from '../mercadolivre/falso';
import { CAMINHO_EMPRESAS, CAMINHO_ML } from './cliente';

/**
 * Bitbrain falso (D3): só para testes e e2e, e só vale com PERMITIR_FALSOS=1 (lerEnv e fetchDoBitbrain conferem).
 * Imita o contrato docs/integracao/bitbrain-rota-devolucoes.md por cima do ML falso: Bearer, /empresas, lista fechada,
 * dados pessoais tirados e o mesmo código HTTP. Sem estado, como o ML falso (o servidor e o worker respondem igual).
 */
export const EMPRESAS_FALSAS = [
  { empresa: 'loja-falsa-1', nome: 'Loja Falsa 1', seller_id: '123456789' },
  { empresa: 'loja-falsa-2', nome: 'Loja Falsa 2', seller_id: '223456789' },
] as const;
/** Fica fora do /empresas; todo /ml dela dá 504, como a falha de rede entre o Bitbrain e o ML ("uma conta que falha não para as outras", D6). */
export const EMPRESA_FALSA_FORA_DO_AR = 'loja-falsa-fora';
/** O que a busca de cada empresa acha: ids fixos dos cenários do ML falso (5<c><seq>). Os bancos de teste começam vazios. */
export const RECLAMACOES_FALSAS_POR_EMPRESA: Record<string, string[]> = {
  'loja-falsa-1': ['5200000001'],
  'loja-falsa-2': ['5500000002'],
};

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

const SIMPLES: RegExp[] = [
  /^\/post-purchase\/v1\/claims\/\d+$/,
  /^\/post-purchase\/v2\/claims\/\d+\/returns$/,
  /^\/post-purchase\/v1\/claims\/\d+\/affects-reputation$/,
  /^\/post-purchase\/v1\/returns\/\d+\/reviews$/,
  /^\/post-purchase\/v1\/claims\/reasons\/[A-Z0-9]+$/,
  /^\/orders\/\d+$/,
  /^\/items\/MLB\d+$/,
  /^\/shipments\/\d+$/,
  /^\/invoices\/orders\/\d+$/,
];
const DO_VENDEDOR: RegExp[] = [/^\/users\/(\d+)\/invoices\/orders\/\d+$/, /^\/users\/(\d+)\/invoices\/documents\/xml\/[A-Za-z0-9_-]+\/authorized$/];
const PARAMETROS_BUSCA = new Set(['players.user_id', 'players.role', 'range', 'limit', 'offset']);

/** A lista fechada do contrato: 12 formatos, só GET, {seller} igual ao da empresa e só os parâmetros da busca. */
export function caminhoPermitido(alvo: URL, sellerId: string): boolean {
  const caminho = alvo.pathname;
  if (caminho === '/post-purchase/v1/claims/search') {
    const q = alvo.searchParams;
    if ([...q.keys()].some((k) => !PARAMETROS_BUSCA.has(k))) return false;
    const limite = Number(q.get('limit') ?? '');
    const offset = Number(q.get('offset') ?? '0');
    return (
      q.get('players.user_id') === sellerId &&
      q.get('players.role') === 'respondent' &&
      /^last_updated:after:.+$/.test(q.get('range') ?? '') &&
      Number.isInteger(limite) &&
      limite >= 1 &&
      limite <= 100 &&
      Number.isInteger(offset) &&
      offset >= 0 &&
      offset <= 9900
    );
  }
  if (alvo.search) return false;
  if (SIMPLES.some((r) => r.test(caminho))) return true;
  return DO_VENDEDOR.some((r) => r.exec(caminho)?.[1] === sellerId);
}

type Objeto = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
function apenas(valor: unknown, chaves: readonly string[]): Objeto {
  if (!ehObjeto(valor)) return {};
  return Object.fromEntries(chaves.filter((c) => c in valor).map((c) => [c, valor[c]]));
}
const CAMPOS_PEDIDO = ['id', 'status', 'date_created', 'pack_id', 'tags'] as const;
const CAMPOS_ITEM = ['id', 'title', 'seller_sku', 'seller_custom_field', 'variation_id'] as const;
const CAMPOS_ENVIO = ['id', 'status', 'substatus', 'tracking_number', 'tracking_method', 'logistic_type', 'status_history', 'date_created', 'last_updated'] as const;

function devolucaoSemEndereco(d: unknown): unknown {
  if (!ehObjeto(d) || !Array.isArray(d.shipments)) return d;
  return {
    ...d,
    shipments: d.shipments.map((s) => {
      if (!ehObjeto(s) || !ehObjeto(s.destination)) return s;
      return { ...s, destination: { name: s.destination.name ?? null } };
    }),
  };
}

/** Seção "Dados pessoais" do contrato: o que sai em /orders, /shipments e /returns. O resto vai como veio. */
export function semDadosPessoais(caminho: string, corpo: unknown): unknown {
  if (/^\/orders\/\d+$/.test(caminho) && ehObjeto(corpo)) {
    const itens = Array.isArray(corpo.order_items) ? corpo.order_items : [];
    return {
      ...apenas(corpo, CAMPOS_PEDIDO),
      ...(ehObjeto(corpo.shipping) ? { shipping: { id: corpo.shipping.id ?? null } } : {}),
      order_items: itens.map((l) => (ehObjeto(l) ? { item: apenas(l.item, CAMPOS_ITEM), quantity: l.quantity, unit_price: l.unit_price } : l)),
    };
  }
  if (/^\/shipments\/\d+$/.test(caminho)) return apenas(corpo, CAMPOS_ENVIO);
  if (/^\/post-purchase\/v2\/claims\/\d+\/returns$/.test(caminho)) return Array.isArray(corpo) ? corpo.map(devolucaoSemEndereco) : devolucaoSemEndereco(corpo);
  return corpo;
}

function buscaFalsa(empresa: string, alvo: URL): Response {
  const ids = RECLAMACOES_FALSAS_POR_EMPRESA[empresa] ?? [];
  const offset = Number(alvo.searchParams.get('offset') ?? 0);
  const agora = new Date().toISOString();
  return respostaJson({
    paging: { total: ids.length, offset, limit: 100 },
    data: offset > 0 ? [] : ids.map((id) => ({ id: Number(id), last_updated: agora, related_entities: ['return'] })),
  });
}

export const fetchBitbrainFalso: typeof fetch = async (entrada, init) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  if (url.origin !== new URL(URL_BITBRAIN_FALSO).origin) return respostaJson({ detail: 'Not Found' }, 404);
  if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN_BITBRAIN_FALSO}`) return respostaJson({ erro: 'token inválido' }, 401);
  if (url.pathname === CAMINHO_EMPRESAS) return respostaJson({ empresas: EMPRESAS_FALSAS });
  if (url.pathname !== CAMINHO_ML) return respostaJson({ detail: 'Not Found' }, 404);
  const empresa = url.searchParams.get('empresa') ?? '';
  const caminho = url.searchParams.get('caminho') ?? '';
  if (empresa === EMPRESA_FALSA_FORA_DO_AR) return respostaJson({ message: 'gateway timeout', error: 'gateway_timeout', status: 504 }, 504);
  const dados = EMPRESAS_FALSAS.find((e) => e.empresa === empresa);
  if (!dados || !caminho.startsWith('/')) return respostaJson({ erro: 'empresa sem conta do ML' }, 404);
  const alvo = new URL(caminho, API_ML);
  if (!caminhoPermitido(alvo, dados.seller_id)) return respostaJson({ erro: 'caminho não permitido' }, 403);
  if (alvo.pathname === '/post-purchase/v1/claims/search') return buscaFalsa(empresa, alvo);
  const resposta = await fetchFalsoML(`${API_ML}${alvo.pathname}${alvo.search}`, {
    headers: { authorization: `Bearer ${PREFIXO_TOKEN_FALSO}BITBRAIN`, ...(alvo.pathname.startsWith('/shipments/') ? { 'x-format-new': 'true' } : {}) },
  });
  const tipo = resposta.headers.get('content-type') ?? 'application/json';
  const texto = await resposta.text();
  if (!resposta.ok || !tipo.includes('json')) return new Response(texto, { status: resposta.status, headers: { 'content-type': tipo } });
  return respostaJson(semDadosPessoais(alvo.pathname, JSON.parse(texto)), resposta.status);
};
