import { afterEach, describe, expect, it, vi } from 'vitest';
import anexo from '../../../../tests/fixtures/ml/doc/anexo.json';
import anuncio from '../../../../tests/fixtures/ml/doc/anuncio.json';
import busca from '../../../../tests/fixtures/ml/doc/busca-reclamacoes.json';
import devolucao from '../../../../tests/fixtures/ml/doc/devolucao.json';
import envio from '../../../../tests/fixtures/ml/doc/envio.json';
import motivos from '../../../../tests/fixtures/ml/doc/motivos.json';
import notaVenda from '../../../../tests/fixtures/ml/doc/nota-venda.json';
import pedido from '../../../../tests/fixtures/ml/doc/pedido.json';
import reclamacao from '../../../../tests/fixtures/ml/doc/reclamacao.json';
import { criarClienteML } from './cliente';
import { ConectorML, corpoRevisaoComProblema, ErroReclamacaoSemDevolucao } from './conector';
import { ErroMotivoIndisponivel } from './erros';

type Rota = () => Response;
const json =
  (corpo: unknown, status = 200): Rota =>
  () =>
    new Response(JSON.stringify(corpo), { status });

afterEach(() => {
  vi.restoreAllMocks();
});

function montar(rotas: Record<string, Rota>) {
  const fetchFn = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const rota = rotas[`${init?.method ?? 'GET'} ${url.pathname}`];
    return rota ? rota() : new Response('{"message":"not_found"}', { status: 404 });
  });
  const conector = new ConectorML({ sellerId: '123456789', cliente: criarClienteML({ accessToken: 'TOKEN', fetchFn }) });
  const chamadas = () =>
    fetchFn.mock.calls.map(([entrada, init]) => {
      const u = new URL(String(entrada));
      return `${init?.method ?? 'GET'} ${u.pathname}`;
    });
  return { fetchFn, conector, chamadas };
}

const ROTAS_RECLAMACAO: Record<string, Rota> = {
  'GET /post-purchase/v1/claims/5292183123': json(reclamacao),
  'GET /post-purchase/v2/claims/5292183123/returns': json(devolucao),
  'GET /orders/2000008003035430': json(pedido),
  'GET /items/MLB3456789012': json(anuncio),
  'GET /shipments/41896532561': json(envio),
};

describe('ConectorML.obterReclamacao (spec §7.2: reclamação → devolução → pedidos → anúncio → envio)', () => {
  it('busca tudo na ordem e mapeia; o envio vai com x-format-new', async () => {
    const { conector, chamadas, fetchFn } = montar(ROTAS_RECLAMACAO);
    const dados = await conector.obterReclamacao('5292183123');
    expect(dados.devolucao).toMatchObject({
      devolucaoExternaId: '14958493',
      pedidos: ['2000008003035430'],
      statusCanal: 'shipped/shipped',
      rastreio: 'QB123456789BR',
      itens: [{ sku: 'fone-01', ean: '7891234567888', quantidade: 1 }],
    });
    expect(chamadas()).toEqual([
      'GET /post-purchase/v1/claims/5292183123',
      'GET /post-purchase/v2/claims/5292183123/returns',
      'GET /orders/2000008003035430',
      'GET /items/MLB3456789012',
      'GET /shipments/41896532561',
    ]);
    expect(fetchFn.mock.calls[4][1]?.headers).toMatchObject({ 'x-format-new': 'true' });
  });

  it('reclamação sem devolução: não busca mais nada', async () => {
    const { conector, chamadas } = montar({ 'GET /post-purchase/v1/claims/5292183123': json({ ...reclamacao, related_entities: [] }) });
    expect((await conector.obterReclamacao('5292183123')).devolucao).toBeNull();
    expect(chamadas()).toEqual(['GET /post-purchase/v1/claims/5292183123']);
  });

  it('aceita a devolução v2 em lista (suposição A2)', async () => {
    const { conector } = montar({ ...ROTAS_RECLAMACAO, 'GET /post-purchase/v2/claims/5292183123/returns': json([devolucao]) });
    expect((await conector.obterReclamacao('5292183123')).devolucao?.devolucaoExternaId).toBe('14958493');
  });

  it('anúncio e envio recusados (404, 403) não impedem: ficam sem EAN e sem transportadora', async () => {
    const { conector } = montar({
      ...ROTAS_RECLAMACAO,
      'GET /items/MLB3456789012': json({ message: 'not_found' }, 404),
      'GET /shipments/41896532561': json({ message: 'forbidden' }, 403),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await conector.obterReclamacao('5292183123')).devolucao).toMatchObject({ transportadora: null, itens: [{ ean: null }] });
  });

  it('obter lança ErroReclamacaoSemDevolucao quando não há devolução', async () => {
    const { conector } = montar({ 'GET /post-purchase/v1/claims/5292183123': json({ ...reclamacao, related_entities: [] }) });
    await expect(conector.obter('5292183123')).rejects.toBeInstanceOf(ErroReclamacaoSemDevolucao);
  });
});

describe('ConectorML: varredura (spec §7.2)', () => {
  it('busca como respondente, desde a data no horário de Brasília, e fica só com quem tem devolução', async () => {
    const { conector, fetchFn } = montar({ 'GET /post-purchase/v1/claims/search': json(busca) });
    const vistas = [];
    for await (const r of conector.reclamacoesAtualizadasDesde(new Date('2026-11-01T12:00:00Z'))) vistas.push(r.reclamacaoId);
    expect(vistas).toEqual(['5292183123']);
    const consulta = new URL(String(fetchFn.mock.calls[0][0])).searchParams;
    expect(Object.fromEntries(consulta)).toEqual({
      'players.user_id': '123456789',
      'players.role': 'respondent',
      range: 'last_updated:after:2026-11-01T09:00:00.000-0300',
      limit: '100',
      offset: '0',
    });
  });

  it('pagina de 100 em 100 até o total', async () => {
    const pagina = (inicio: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: 7_000_000_000 + inicio + i, related_entities: ['return'], last_updated: '2026-11-09T14:20:00.000-03:00' }));
    const fetchFn = vi.fn(async (entrada: string | URL | Request) => {
      const offset = Number(new URL(String(entrada)).searchParams.get('offset'));
      return new Response(JSON.stringify({ paging: { total: 150 }, data: offset === 0 ? pagina(0, 100) : pagina(100, 50) }), { status: 200 });
    });
    const conector = new ConectorML({ sellerId: '1', cliente: criarClienteML({ accessToken: 'T', fetchFn }) });
    const vistas: string[] = [];
    for await (const r of conector.reclamacoesAtualizadasDesde(new Date())) vistas.push(r.reclamacaoId);
    expect(vistas).toHaveLength(150);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('listarAtualizadasDesde (contrato §5.3) devolve as DevolucaoExterna', async () => {
    const { conector } = montar({ ...ROTAS_RECLAMACAO, 'GET /post-purchase/v1/claims/search': json(busca) });
    const lista = [];
    for await (const d of conector.listarAtualizadasDesde(new Date())) lista.push(d.devolucaoExternaId);
    expect(lista).toEqual(['14958493']);
  });
});

describe('ConectorML.enviarResultadoConferencia (spec §7.4)', () => {
  it('OK: POST return-review com {}', async () => {
    const { conector, fetchFn } = montar({ 'POST /post-purchase/v1/returns/14958493/return-review': json({}) });
    await conector.enviarResultadoConferencia('14958493', { tipo: 'OK' });
    expect(fetchFn.mock.calls[0][1]?.body).toBe('{}');
  });

  it('PROBLEMA: confere o motivo, sobe cada foto e manda a revisão com os file_name', async () => {
    const { conector, fetchFn, chamadas } = montar({
      'GET /post-purchase/v1/returns/reasons': json(motivos),
      'POST /post-purchase/v1/claims/5292183123/returns/attachments': json(anexo),
      'POST /post-purchase/v1/returns/14958493/return-review': json({}),
    });
    const foto = { nome: 'DEV-000001-1.jpg', conteudo: Buffer.from('jpg'), tipoConteudo: 'image/jpeg' as const };
    await conector.enviarResultadoConferencia('14958493', {
      tipo: 'PROBLEMA',
      reclamacaoId: '5292183123',
      motivo: 'SRF2',
      mensagem: 'Chegou quebrado.',
      anexos: [foto, { ...foto, nome: 'DEV-000001-2.jpg' }],
    });
    expect(chamadas()).toEqual([
      'GET /post-purchase/v1/returns/reasons',
      'POST /post-purchase/v1/claims/5292183123/returns/attachments',
      'POST /post-purchase/v1/claims/5292183123/returns/attachments',
      'POST /post-purchase/v1/returns/14958493/return-review',
    ]);
    expect(new URL(String(fetchFn.mock.calls[0][0])).search).toBe('?flow=seller_return_failed&claim_id=5292183123');
    expect(JSON.parse(String(fetchFn.mock.calls[3][1]?.body))).toEqual([
      { reason_id: 'SRF2', message: 'Chegou quebrado.', attachments: [anexo.file_name, anexo.file_name] },
    ]);
  });

  it('motivo que o ML não oferece: ErroMotivoIndisponivel, sem subir foto', async () => {
    const { conector, chamadas } = montar({ 'GET /post-purchase/v1/returns/reasons': json(motivos.filter((m) => m.id !== 'SRF5')) });
    const erro = await conector
      .enviarResultadoConferencia('14958493', { tipo: 'PROBLEMA', reclamacaoId: '5292183123', motivo: 'SRF5', mensagem: 'm', anexos: [] })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroMotivoIndisponivel);
    expect(chamadas()).toEqual(['GET /post-purchase/v1/returns/reasons']);
  });

  it('lista de motivos fora do formato: não valida e segue (suposição A8)', async () => {
    const { conector, chamadas } = montar({
      'GET /post-purchase/v1/returns/reasons': json({ outra: 'coisa' }),
      'POST /post-purchase/v1/returns/14958493/return-review': json({}),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await conector.enviarResultadoConferencia('14958493', { tipo: 'PROBLEMA', reclamacaoId: '5292183123', motivo: 'SRF6', mensagem: 'm', anexos: [] });
    expect(chamadas().at(-1)).toBe('POST /post-purchase/v1/returns/14958493/return-review');
  });

  it('corpoRevisaoComProblema: order_id em número quando cabe, em texto quando não', () => {
    const base = { tipo: 'PROBLEMA' as const, reclamacaoId: '1', motivo: 'SRF3' as const, mensagem: 'm', anexos: [] };
    expect(corpoRevisaoComProblema({ ...base, pedido: '2000008003035430' }, ['a'])).toEqual({
      reason_id: 'SRF3',
      message: 'm',
      attachments: ['a'],
      order_id: 2000008003035430,
    });
    expect(corpoRevisaoComProblema({ ...base, pedido: '20000080030354301234' }, []).order_id).toBe('20000080030354301234');
    expect(corpoRevisaoComProblema(base, [])).not.toHaveProperty('order_id');
  });
});

describe('ConectorML.obterXmlNotaVenda (spec §7.5, contrato §5.8, suposição A10)', () => {
  it('acha a nota do pedido e baixa o XML autorizado', async () => {
    const { conector, fetchFn } = montar({
      'GET /users/123456789/invoices/orders/2000008003035430': json(notaVenda),
      'GET /users/123456789/invoices/documents/xml/987654/authorized': () => new Response('<nfeProc/>', { status: 200 }),
    });
    expect(await conector.obterXmlNotaVenda('2000008003035430')).toBe('<nfeProc/>');
    expect(fetchFn.mock.calls[1][1]?.headers).toMatchObject({ accept: 'application/xml' });
  });

  it('sem nota no ML: null (o Fiscal anexa o XML)', async () => {
    const { conector } = montar({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await conector.obterXmlNotaVenda('2000008003035430')).toBeNull();
  });
});
