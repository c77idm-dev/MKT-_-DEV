import { describe, expect, it, vi } from 'vitest';
import { ErroML } from '../mercadolivre/cliente';
import { ehRecusaDefinitiva } from '../mercadolivre/erros';
import { CAMINHO_EMPRESAS, CAMINHO_ML, criarClienteViaBitbrain, ErroBitbrain, ErroRespostaManual, listarEmpresasBitbrain } from './cliente';

const URL_BB = 'https://bitbrain.exemplo.com.br/';
const TOKEN = 'token-secreto-de-teste';
type Chamada = [string, RequestInit];

const resposta = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...cabecalhos } });

function emSequencia(...respostas: Response[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura para tipar mock.calls
  return vi.fn(async (_url: string, _init?: RequestInit) => respostas.shift() ?? resposta({}));
}

const cliente = (fetchFn: unknown, extra: Record<string, unknown> = {}) =>
  criarClienteViaBitbrain({ url: URL_BB, token: TOKEN, empresa: 'megadino', fetchFn: fetchFn as typeof fetch, ...extra });

describe('criarClienteViaBitbrain (ClienteML pela rota do Bitbrain)', () => {
  it('GET vai à rota com a empresa e o caminho (com a query) e o Bearer do Bitbrain', async () => {
    const fetchFn = emSequencia(resposta({ id: 1 }));
    expect(await cliente(fetchFn).get('/post-purchase/v1/claims/search?player_role=respondent&offset=0', { 'x-format-new': 'true' })).toEqual({ id: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(`https://bitbrain.exemplo.com.br${CAMINHO_ML}`);
    expect(Object.fromEntries(u.searchParams)).toEqual({ empresa: 'megadino', caminho: '/post-purchase/v1/claims/search?player_role=respondent&offset=0' });
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('getTexto devolve o XML como veio', async () => {
    const fetchFn = emSequencia(new Response('<nfeProc/>', { status: 200, headers: { 'content-type': 'application/xml' } }));
    expect(await cliente(fetchFn).getTexto('/users/1/invoices/documents/xml/ABC/authorized')).toBe('<nfeProc/>');
  });

  it('repassa o código do ML: 404 vira ErroML com o caminho sem a query e a empresa, sem o token', async () => {
    const fetchFn = emSequencia(resposta({ message: 'not_found', error: 'not_found', status: 404 }, 404));
    const erro = await cliente(fetchFn).get('/orders/1?x=1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 404, caminho: '/orders/1', empresa: 'megadino' });
    expect(JSON.stringify(erro)).not.toContain(TOKEN);
    expect((erro as Error).message).not.toContain(TOKEN);
  });

  it('429 com Retry-After espera o que veio e tenta de novo (paridade com o cliente do ML)', async () => {
    const fetchFn = emSequencia(resposta({ error: 'local_rate_limited' }, 429, { 'retry-after': '2' }), resposta({ ok: true }));
    const esperar = vi.fn(async () => {});
    expect(await cliente(fetchFn, { esperar }).get('/x')).toEqual({ ok: true });
    expect(esperar.mock.calls).toEqual([[2000]]);
  });

  it('desiste depois de 3 novas tentativas com ErroML 429', async () => {
    const fetchFn = vi.fn(async () => resposta({ error: 'local_rate_limited' }, 429));
    const erro = await cliente(fetchFn, { esperar: async () => {} }).get('/x').catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 429 });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('5xx vira ErroML passageiro (a tarefa tenta de novo): 500, o 502 do JSON fora do formato e o 504 da rede do ML', async () => {
    for (const status of [500, 502, 504]) {
      const erro = await cliente(emSequencia(resposta({ message: 'falha' }, status))).get('/orders/1').catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroML);
      expect(erro).toMatchObject({ status });
      expect(ehRecusaDefinitiva(erro)).toBe(false);
    }
  });

  it('o limite da rota (429 com Retry-After: 60) espera os 60 s inteiros (D20)', async () => {
    const fetchFn = emSequencia(resposta({ erro: 'limite de requisições' }, 429, { 'retry-after': '60' }), resposta({ ok: true }));
    const esperar = vi.fn(async () => {});
    expect(await cliente(fetchFn, { esperar }).get('/x')).toEqual({ ok: true });
    expect(esperar.mock.calls).toEqual([[60_000]]);
  });

  it('recusa da própria rota ({"erro": ...}) vira ErroBitbrain, nunca ErroML (D5)', async () => {
    const casos = [
      [401, { erro: 'token inválido' }, 'token'],
      [403, { erro: 'caminho não permitido' }, 'caminho'],
      [404, { erro: 'empresa sem conta do ML' }, 'empresa'],
    ] as const;
    for (const [status, corpo, motivo] of casos) {
      const erro = await cliente(emSequencia(resposta(corpo, status))).get('/x?y=1').catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroBitbrain);
      expect(erro).not.toBeInstanceOf(ErroML);
      expect(erro).toMatchObject({ status, motivo, empresa: 'megadino' });
    }
    const token = await cliente(emSequencia(resposta({ erro: 'token inválido' }, 401))).get('/x').catch((e: unknown) => e);
    expect((token as Error).message).toContain('Bitbrain recusou: confira o BITBRAIN_TOKEN');
  });

  it('2xx que não é JSON vira ErroML (e não SyntaxError)', async () => {
    const erro = await cliente(emSequencia(new Response('<html>x</html>', { status: 200 }))).get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
  });

  it('tempo limite: o pedido é abortado depois de timeoutMs', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(init.signal?.reason))),
    );
    const erro = await cliente(fetchFn, { timeoutMs: 20 }).get('/x').catch((e: unknown) => e);
    expect((erro as Error).name).toBe('TimeoutError');
  });

  it('post e postArquivo lançam ErroRespostaManual ("responda no ML à mão") sem chamar o Bitbrain', async () => {
    const fetchFn = vi.fn();
    const c = cliente(fetchFn);
    await expect(c.post('/post-purchase/v1/returns/1/return-review', {})).rejects.toBeInstanceOf(ErroRespostaManual);
    await expect(c.postArquivo('/x', { nome: 'a.jpg', conteudo: Buffer.from('a'), tipoConteudo: 'image/jpeg' })).rejects.toThrow(/responda no ML à mão/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('listarEmpresasBitbrain', () => {
  it('lê as empresas (seller_id em texto ou número), sem repetir, com o Bearer', async () => {
    const fetchFn = emSequencia(
      resposta({
        empresas: [
          { empresa: 'megadino', nome: 'IDM Shop', seller_id: '25255785' },
          { empresa: 'how', nome: '', seller_id: 111 },
          { empresa: 'megadino', nome: 'IDM Shop', seller_id: '25255785' },
        ],
      }),
    );
    expect(await listarEmpresasBitbrain({ url: URL_BB, token: TOKEN, fetchFn: fetchFn as unknown as typeof fetch })).toEqual([
      { empresa: 'megadino', nome: 'IDM Shop', sellerId: '25255785' },
      { empresa: 'how', nome: 'how', sellerId: '111' },
    ]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    expect(new URL(url).pathname).toBe(CAMINHO_EMPRESAS);
    expect(init.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
  });

  it('401 → token; 404 ou 5xx → fora_do_ar; corpo estranho → formato', async () => {
    const ler = (r: Response) => listarEmpresasBitbrain({ url: URL_BB, token: TOKEN, fetchFn: emSequencia(r) as unknown as typeof fetch }).catch((e: unknown) => e);
    expect(await ler(resposta({ erro: 'token inválido' }, 401))).toMatchObject({ motivo: 'token' });
    expect(await ler(resposta({ detail: 'Not Found' }, 404))).toMatchObject({ motivo: 'fora_do_ar' });
    expect(await ler(resposta('erro', 502))).toMatchObject({ motivo: 'fora_do_ar' });
    expect(await ler(resposta({ contas: [] }))).toMatchObject({ motivo: 'formato' });
  });
});
