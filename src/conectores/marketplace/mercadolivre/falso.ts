import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { API_ML } from './cliente';
import { URL_TOKEN_ML } from './oauth';

/**
 * Mercado Livre falso (dev, testes e e2e; contrato §5.3 e D17: o lerEnv recusa ML_CONECTOR=falso em produção).
 * Troca só o `fetch`: o ConectorML, o OAuth e o mapeamento rodam de verdade sobre respostas montadas a partir dos
 * exemplos da documentação (tests/fixtures/ml/doc) e dos cenários (tests/fixtures/ml-falso/cenarios.json).
 *
 * Sem estado: o cenário vem do próprio id, então o servidor e o worker (processos diferentes) respondem igual.
 *   reclamação 5<c><seq>, devolução 6<c><seq>, envio 4<c><seq>, pedido 20000<i>0<c><seq>, anúncio MLB9<i><c><seq>
 *   (c = cenário de 1 a 9; seq = 8 dígitos; i = posição do item na devolução)
 */

export const PREFIXO_TOKEN_FALSO = 'APP_USR-FALSO-';
export const PREFIXO_REFRESH_FALSO = 'TG-FALSO-';
/** Refresh token que o falso recusa com invalid_grant (conta em RECONECTAR nos testes). */
export const REFRESH_REVOGADO = 'TG-FALSO-REVOGADO';

type CenarioFalso = {
  nome: string;
  semDevolucao?: boolean;
  recusarRevisao?: boolean;
  devolucao?: { status: string; subtype: string };
  envio?: { status: string; type: string; destino: string } | null;
  itens?: { sku: string; quantidade: string }[];
};
type ArquivoCenarios = {
  vendedor: number;
  cenarios: Record<string, CenarioFalso>;
  notaVenda: { cnpjEmitente: string; ncm: string; valorUnitario: string; ean: string; descricao: string };
};

const cache = new Map<string, unknown>();

function lerJson(...partes: string[]): unknown {
  const arquivo = path.join(process.cwd(), ...partes);
  if (!cache.has(arquivo)) {
    try {
      cache.set(arquivo, JSON.parse(readFileSync(arquivo, 'utf8')));
    } catch {
      throw new Error(`ML falso: não achei ${arquivo}. Rode na raiz do projeto (ML_CONECTOR=falso é só para dev e testes).`);
    }
  }
  return structuredClone(cache.get(arquivo));
}

const doc = (nome: string) => lerJson('tests', 'fixtures', 'ml', 'doc', nome) as Record<string, unknown>;
const docBruto = (nome: string) => lerJson('tests', 'fixtures', 'ml', 'doc', nome);
const arquivo = () => lerJson('tests', 'fixtures', 'ml-falso', 'cenarios.json') as ArquivoCenarios;
const cenario = (n: number): CenarioFalso | null => arquivo().cenarios[String(n)] ?? null;

export function vendedorFalso(): string {
  return String(arquivo().vendedor);
}

export type IdsFalsos = {
  cenario: number;
  seq: string;
  reclamacaoId: string;
  devolucaoId: string;
  envioId: string;
  rastreio: string;
  pedidos: string[];
  itens: string[];
};

export function idsFalsos(numero: number, seq: string): IdsFalsos {
  const quantos = Math.max(cenario(numero)?.itens?.length ?? 0, 1);
  const posicoes = Array.from({ length: quantos }, (_, i) => i);
  return {
    cenario: numero,
    seq,
    reclamacaoId: `5${numero}${seq}`,
    devolucaoId: `6${numero}${seq}`,
    envioId: `4${numero}${seq}`,
    rastreio: `ML${numero}${seq}BR`,
    pedidos: posicoes.map((i) => `20000${i}0${numero}${seq}`),
    itens: posicoes.map((i) => `MLB9${i}${numero}${seq}`),
  };
}

function idsPor(id: string, padrao: RegExp): IdsFalsos | null {
  const m = padrao.exec(id);
  return m ? idsFalsos(Number(m[1]), m[2]) : null;
}

export function idsDaReclamacaoFalsa(reclamacaoId: string): IdsFalsos | null {
  return idsPor(reclamacaoId, /^5([1-9])(\d{8})$/);
}

function posicaoDoPedido(pedido: string): { ids: IdsFalsos; i: number } | null {
  const m = /^20000(\d)0([1-9])(\d{8})$/.exec(pedido);
  return m ? { ids: idsFalsos(Number(m[2]), m[3]), i: Number(m[1]) } : null;
}

let contador = 0;
/** Id de reclamação novo do cenário (único por execução; os testes e o e2e usam). */
export function idReclamacaoFalsa(numero: number): string {
  contador = (contador + 1) % 10;
  return `5${numero}${String((Date.now() % 10_000_000) * 10 + contador).padStart(8, '0')}`;
}

/** No modo falso, "Conectar" não sai do sistema: volta direto ao retorno do OAuth com um código falso. */
export function urlAutorizacaoFalsa(state: string): string {
  return `/api/ml/retorno?${new URLSearchParams({ code: `${PREFIXO_REFRESH_FALSO}${randomBytes(6).toString('hex')}`, state })}`;
}

/** Dígito verificador da chave da NF-e (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function digitoChaveNFe(chave43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i -= 1) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? '0' : String(11 - resto);
}

const DIA = 86_400_000;

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}
const naoEncontrado = () => respostaJson({ message: 'not_found', error: 'not_found', status: 404 }, 404);

function reclamacaoFalsa(ids: IdsFalsos, c: CenarioFalso, agora: Date) {
  const prazo = new Date(agora.getTime() + 3 * DIA).toISOString();
  return {
    ...doc('reclamacao.json'),
    id: Number(ids.reclamacaoId),
    resource_id: Number(ids.pedidos[0]),
    related_entities: c.semDevolucao ? [] : ['return'],
    players: [
      { role: 'complainant', type: 'buyer', user_id: 987654321, available_actions: [] },
      {
        role: 'respondent',
        type: 'seller',
        user_id: arquivo().vendedor,
        available_actions: [
          { action: 'return_review_ok', due_date: prazo, mandatory: false },
          { action: 'return_review_fail', due_date: prazo, mandatory: false },
        ],
      },
    ],
    date_created: new Date(agora.getTime() - 2 * DIA).toISOString(),
    last_updated: agora.toISOString(),
  };
}

function devolucaoFalsa(ids: IdsFalsos, c: CenarioFalso, agora: Date) {
  return {
    ...doc('devolucao.json'),
    id: Number(ids.devolucaoId),
    claim_id: Number(ids.reclamacaoId),
    status: c.devolucao?.status ?? 'shipped',
    subtype: c.devolucao?.subtype ?? 'return_total',
    shipments: c.envio
      ? [{ shipment_id: Number(ids.envioId), status: c.envio.status, tracking_number: ids.rastreio, type: c.envio.type, destination: { name: c.envio.destino } }]
      : [],
    orders: (c.itens ?? []).map((item, i) => ({
      order_id: Number(ids.pedidos[i]),
      item_id: ids.itens[i],
      variation_id: null,
      context_type: 'total',
      total_quantity: item.quantidade,
      return_quantity: item.quantidade,
    })),
    date_created: new Date(agora.getTime() - 2 * DIA).toISOString(),
    last_updated: agora.toISOString(),
  };
}

function pedidoFalso(ids: IdsFalsos, i: number) {
  const item = cenario(ids.cenario)?.itens?.[i];
  if (!item) return null;
  const nota = arquivo().notaVenda;
  return {
    ...doc('pedido.json'),
    id: Number(ids.pedidos[i]),
    order_items: [
      {
        item: { id: ids.itens[i], title: nota.descricao, variation_id: null, seller_sku: item.sku, seller_custom_field: null },
        quantity: Math.round(Number(item.quantidade)),
        unit_price: Number(nota.valorUnitario),
        currency_id: 'BRL',
      },
    ],
  };
}

function envioFalso(ids: IdsFalsos, c: CenarioFalso, agora: Date) {
  if (!c.envio) return null;
  return {
    ...doc('envio.json'),
    id: Number(ids.envioId),
    status: c.envio.status,
    tracking_number: ids.rastreio,
    tracking_method: 'Correios',
    status_history: {
      date_shipped: new Date(agora.getTime() - DIA).toISOString(),
      date_delivered: c.envio.status === 'delivered' ? new Date(agora.getTime() - 3_600_000).toISOString() : null,
    },
  };
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** NF-e de venda (layout 4.00, homologação) de um pedido do cenário, para a Fase 4 testar "NF de venda obtida do ML". */
function xmlNotaVenda(ids: IdsFalsos, i: number): string | null {
  const item = cenario(ids.cenario)?.itens?.[i];
  if (!item) return null;
  const nota = arquivo().notaVenda;
  const pedido = ids.pedidos[i];
  const base = `352611${nota.cnpjEmitente}55001${pedido.slice(-9)}1${pedido.slice(-8)}`;
  const chave = `${base}${digitoChaveNFe(base)}`;
  const quantidade = Math.round(Number(item.quantidade));
  const unitario = Number(nota.valorUnitario).toFixed(2);
  const total = (Number(nota.valorUnitario) * quantidade).toFixed(2);
  const sku = escaparXml(item.sku);
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00">
<ide><cUF>35</cUF><cNF>${pedido.slice(-8)}</cNF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${Number(pedido.slice(-9))}</nNF><dhEmi>2026-11-01T10:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>2</idDest><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>2</indPres></ide>
<emit><CNPJ>${nota.cnpjEmitente}</CNPJ><xNome>Loja de Teste do ML Falso Ltda</xNome><enderEmit><xLgr>Rua do Emitente</xLgr><nro>10</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>Sao Paulo</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit><IE>110042490114</IE><CRT>1</CRT></emit>
<dest><CPF>12345678909</CPF><xNome>Comprador de Teste</xNome><enderDest><xLgr>Rua do Comprador</xLgr><nro>200</nro><xBairro>Copacabana</xBairro><cMun>3304557</cMun><xMun>Rio de Janeiro</xMun><UF>RJ</UF><CEP>22010000</CEP></enderDest><indIEDest>9</indIEDest></dest>
<det nItem="1"><prod><cProd>${sku}</cProd><cEAN>${nota.ean}</cEAN><xProd>${escaparXml(nota.descricao)}</xProd><NCM>${nota.ncm}</NCM><CFOP>6102</CFOP><uCom>UN</uCom><qCom>${quantidade}.0000</qCom><vUnCom>${unitario}</vUnCom><vProd>${total}</vProd><cEANTrib>${nota.ean}</cEANTrib><uTrib>UN</uTrib><qTrib>${quantidade}.0000</qTrib><vUnTrib>${unitario}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>
<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>${total}</vProd><vNF>${total}</vNF></ICMSTot></total>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>2026-11-01T10:00:05-03:00</dhRecbto><nProt>135260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
}

function token(corpo: URLSearchParams): Response {
  const recebido = corpo.get('grant_type') === 'authorization_code' ? corpo.get('code') : corpo.get('refresh_token');
  if (!recebido || !recebido.startsWith(PREFIXO_REFRESH_FALSO) || recebido === REFRESH_REVOGADO) {
    return respostaJson({ error: 'invalid_grant', message: 'invalid_grant', status: 400 }, 400);
  }
  const marca = randomBytes(8).toString('hex');
  return respostaJson({
    ...doc('token.json'),
    access_token: `${PREFIXO_TOKEN_FALSO}${marca}`,
    refresh_token: `${PREFIXO_REFRESH_FALSO}${marca}`,
    user_id: arquivo().vendedor,
  });
}

type Rota = { metodo: 'GET' | 'POST'; padrao: RegExp; responder: (m: RegExpExecArray, url: URL, agora: Date, init?: RequestInit) => Response };

const ROTAS: Rota[] = [
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v1\/claims\/search$/,
    // A varredura do falso não acha nada: os testes e o e2e mandam avisos com ids de cenário.
    responder: (_m, url) => respostaJson({ paging: { total: 0, offset: Number(url.searchParams.get('offset') ?? 0), limit: 100 }, data: [] }),
  },
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v1\/claims\/(\d+)$/,
    responder: (m, _url, agora) => {
      const ids = idsDaReclamacaoFalsa(m[1]);
      const c = ids && cenario(ids.cenario);
      return ids && c ? respostaJson(reclamacaoFalsa(ids, c, agora)) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/post-purchase\/v2\/claims\/(\d+)\/returns$/,
    responder: (m, _url, agora) => {
      const ids = idsDaReclamacaoFalsa(m[1]);
      const c = ids && cenario(ids.cenario);
      return ids && c && !c.semDevolucao ? respostaJson(devolucaoFalsa(ids, c, agora)) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/orders\/(\d+)$/,
    responder: (m) => {
      const p = posicaoDoPedido(m[1]);
      const pedido = p && pedidoFalso(p.ids, p.i);
      return pedido ? respostaJson(pedido) : naoEncontrado();
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/items\/(MLB9\d[1-9]\d{8})$/,
    responder: (m) => respostaJson({ ...doc('anuncio.json'), id: m[1], variations: [] }),
  },
  {
    metodo: 'GET',
    padrao: /^\/shipments\/(\d+)$/,
    responder: (m, _url, agora) => {
      const ids = idsPor(m[1], /^4([1-9])(\d{8})$/);
      const c = ids && cenario(ids.cenario);
      const envio = ids && c && envioFalso(ids, c, agora);
      return envio ? respostaJson(envio) : naoEncontrado();
    },
  },
  { metodo: 'GET', padrao: /^\/post-purchase\/v1\/returns\/reasons$/, responder: () => respostaJson(docBruto('motivos.json')) },
  {
    metodo: 'POST',
    padrao: /^\/post-purchase\/v1\/claims\/(\d+)\/returns\/attachments$/,
    responder: (_m, _url, _agora, init) =>
      init?.body instanceof FormData && init.body.get('file') instanceof Blob
        ? respostaJson({ user_id: arquivo().vendedor, file_name: `${arquivo().vendedor}_${randomBytes(8).toString('hex')}.jpg` })
        : respostaJson({ message: 'file is required', error: 'bad_request', status: 400 }, 400),
  },
  {
    metodo: 'POST',
    padrao: /^\/post-purchase\/v1\/returns\/(\d+)\/return-review$/,
    responder: (m) => {
      const ids = idsPor(m[1], /^6([1-9])(\d{8})$/);
      const c = ids && cenario(ids.cenario);
      if (!c) return naoEncontrado();
      return c.recusarRevisao ? respostaJson(docBruto('erro-revisao.json'), 400) : respostaJson({});
    },
  },
  {
    metodo: 'GET',
    padrao: /^\/users\/\d+\/invoices\/orders\/(\d+)$/,
    responder: (m) => (posicaoDoPedido(m[1]) ? respostaJson({ ...doc('nota-venda.json'), id: Number(m[1]) }) : naoEncontrado()),
  },
  {
    metodo: 'GET',
    padrao: /^\/users\/\d+\/invoices\/documents\/xml\/(\d+)\/authorized$/,
    responder: (m) => {
      const p = posicaoDoPedido(m[1]);
      const xml = p && xmlNotaVenda(p.ids, p.i);
      return xml ? new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }) : naoEncontrado();
    },
  },
];

export const fetchFalsoML: typeof fetch = async (entrada, init) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  const metodo = (init?.method ?? 'GET').toUpperCase();
  if (`${url.origin}${url.pathname}` === URL_TOKEN_ML && metodo === 'POST') return token(new URLSearchParams(String(init?.body ?? '')));
  if (url.origin !== API_ML) return naoEncontrado();
  const autorizacao = new Headers(init?.headers).get('authorization') ?? '';
  if (!autorizacao.startsWith(`Bearer ${PREFIXO_TOKEN_FALSO}`)) return respostaJson({ message: 'invalid access token', error: 'unauthorized', status: 401 }, 401);
  for (const rota of ROTAS) {
    if (rota.metodo !== metodo) continue;
    const m = rota.padrao.exec(url.pathname);
    if (m) return rota.responder(m, url, new Date(), init);
  }
  return naoEncontrado();
};
