import { describe, expect, it, vi } from 'vitest';
import { analisarJson, API_ML, criarClienteML, ErroML, esperaDo429 } from './cliente';

describe('criarClienteML', () => {
  it('faz GET com o token e os cabeçalhos extras e devolve o JSON', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    const cliente = criarClienteML({ accessToken: 'TOKEN', fetchFn });

    expect(await cliente.get('/shipments/9', { 'x-format-new': 'true' })).toEqual({ id: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_ML}/shipments/9`);
    expect(init.headers).toMatchObject({ authorization: 'Bearer TOKEN', 'x-format-new': 'true', accept: 'application/json' });
  });

  it('lança ErroML com status, corpo e caminho quando a API responde erro', async () => {
    const fetchFn = vi.fn(async () => new Response('{"message":"not_found"}', { status: 404 }));
    const cliente = criarClienteML({ accessToken: 'TOKEN', fetchFn });

    const erro = await cliente.get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 404, corpo: '{"message":"not_found"}', caminho: '/orders/1' });
  });

  it('lança ErroML (e não SyntaxError) quando um 2xx não é JSON', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>x</html>', { status: 200 }));
    const cliente = criarClienteML({ accessToken: 'TOKEN', fetchFn });

    const erro = await cliente.get('/orders/1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroML);
    expect(erro).toMatchObject({ status: 200, corpo: '<html>x</html>', caminho: '/orders/1' });
  });
});

type Chamada = [string, RequestInit];

function emSequencia(...respostas: Response[]) {
  return vi.fn(async () => respostas.shift() ?? new Response('{}', { status: 200 }));
}

describe('esperaDo429 (spec §7.2: espera crescente com jitter)', () => {
  it('dobra a cada tentativa, soma até 250 ms de jitter e para em 8 s', () => {
    expect(esperaDo429(0, null, () => 0)).toBe(500);
    expect(esperaDo429(1, null, () => 1)).toBe(1250);
    expect(esperaDo429(6, null, () => 0)).toBe(8000);
  });

  it('respeita o Retry-After em segundos, até 30 s; ignora data', () => {
    expect(esperaDo429(0, '2', () => 0)).toBe(2000);
    expect(esperaDo429(0, '120', () => 0)).toBe(30_000);
    expect(esperaDo429(0, 'Wed, 21 Oct 2026 07:28:00 GMT', () => 0)).toBe(500);
  });
});

describe('criarClienteML: 429, 401, POST, multipart e texto', () => {
  it('repete o 429 com espera crescente até dar certo', async () => {
    const fetchFn = emSequencia(
      new Response('{"error":"local_rate_limited"}', { status: 429 }),
      new Response('{"error":"local_rate_limited"}', { status: 429 }),
      new Response('{"ok":true}', { status: 200 }),
    );
    const esperar = vi.fn(async () => {});
    const cliente = criarClienteML({ accessToken: 'T', fetchFn, esperar, aleatorio: () => 0 });
    expect(await cliente.get('/x')).toEqual({ ok: true });
    expect(esperar.mock.calls).toEqual([[500], [1000]]);
  });

  it('desiste depois de 3 novas tentativas com ErroML 429', async () => {
    const fetchFn = vi.fn(async () => new Response('{"error":"local_rate_limited"}', { status: 429 }));
    const cliente = criarClienteML({ accessToken: 'T', fetchFn, esperar: async () => {} });
    const erro = await cliente.get('/x').catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 429 });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('no 401 pede um token novo uma vez e repete com ele', async () => {
    const fetchFn = emSequencia(new Response('{"message":"invalid_token"}', { status: 401 }), new Response('{"id":1}', { status: 200 }));
    const renovarToken = vi.fn(async () => 'NOVO');
    const cliente = criarClienteML({ accessToken: async () => 'VELHO', renovarToken, fetchFn });
    expect(await cliente.get('/x')).toEqual({ id: 1 });
    expect(renovarToken).toHaveBeenCalledWith('VELHO');
    const [, init] = fetchFn.mock.calls[1] as unknown as Chamada;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer NOVO');
  });

  it('um segundo 401 vira ErroML (não fica em laço)', async () => {
    const fetchFn = vi.fn(async () => new Response('{"message":"invalid_token"}', { status: 401 }));
    const cliente = criarClienteML({ accessToken: 'T', renovarToken: async () => 'N', fetchFn });
    expect(await cliente.get('/x').catch((e: unknown) => e)).toMatchObject({ status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('post manda JSON com content-type', async () => {
    const fetchFn = emSequencia(new Response('{}', { status: 200 }));
    await criarClienteML({ accessToken: 'T', fetchFn }).post('/post-purchase/v1/returns/1/return-review', {});
    const [url, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    expect(url).toBe(`${API_ML}/post-purchase/v1/returns/1/return-review`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer T' });
  });

  it('postArquivo manda multipart com o campo "file"', async () => {
    const fetchFn = emSequencia(new Response('{"file_name":"a.jpg"}', { status: 200 }));
    const cliente = criarClienteML({ accessToken: 'T', fetchFn });
    const r = await cliente.postArquivo('/anexos', { nome: 'foto.jpg', conteudo: Buffer.from('abc'), tipoConteudo: 'image/jpeg' });
    expect(r).toEqual({ file_name: 'a.jpg' });
    const [, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    const arquivo = (init.body as FormData).get('file') as File;
    expect(arquivo.name).toBe('foto.jpg');
    expect(arquivo.type).toBe('image/jpeg');
    expect(Buffer.from(await arquivo.arrayBuffer()).toString()).toBe('abc');
  });

  it('getTexto devolve o corpo bruto (XML)', async () => {
    const fetchFn = emSequencia(new Response('<nfeProc/>', { status: 200 }));
    expect(await criarClienteML({ accessToken: 'T', fetchFn }).getTexto('/xml', { accept: 'application/xml' })).toBe('<nfeProc/>');
    const [, init] = fetchFn.mock.calls[0] as unknown as Chamada;
    expect(init.headers).toMatchObject({ accept: 'application/xml' });
  });
});

describe('analisarJson', () => {
  it('guarda como texto os inteiros que não cabem num number (pedidos do ML, pendência da Fase 0)', () => {
    expect(analisarJson('{"id": 20000080030354301234, "x": 1.5, "y": 2000008003035430}')).toEqual({
      id: '20000080030354301234',
      x: 1.5,
      y: 2000008003035430,
    });
  });
});
