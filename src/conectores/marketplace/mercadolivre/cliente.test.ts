import { describe, expect, it, vi } from 'vitest';
import { API_ML, criarClienteML, ErroML } from './cliente';

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
});
