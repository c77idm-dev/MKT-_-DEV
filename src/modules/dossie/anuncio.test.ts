import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baixarFotoAnuncio, LIMITE_BYTES_FOTO_ANUNCIO, urlFotoAnuncioPermitida } from './anuncio';
import { PRAZO_FOTO_ANUNCIO_MS } from './dominio';

const FOTO = 'https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg';

let png: Buffer | null = null;
/** Foto do anúncio 1200×900 (o ML guarda até uns 1200 px). */
async function pngAnuncio(): Promise<Buffer> {
  png ??= await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 15, g: 118, b: 110 } } }).png().toBuffer();
  return png;
}

function resposta(corpo: BodyInit | null, o: { status?: number; tipo?: string | null; cabecalhos?: Record<string, string> } = {}): Response {
  const headers = new Headers(o.cabecalhos);
  if (o.tipo !== null) headers.set('content-type', o.tipo ?? 'image/png');
  return new Response(corpo, { status: o.status ?? 200, headers });
}

/** Um fetch falso que responde sempre a mesma coisa e guarda os pedidos. */
function fetchQueResponde(r: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => r());
}

/** Servidor que não responde: só desiste quando o sinal cancela (como o fetch de verdade). */
const fetchParado = vi.fn<typeof fetch>(
  (_entrada, init) =>
    new Promise<Response>((_, rejeitar) => {
      const sinal = init?.signal;
      sinal?.addEventListener('abort', () => rejeitar(sinal.reason), { once: true });
    }),
);

/** Corpo que manda alguns bytes e nunca termina. */
function corpoQueTrava(): ReadableStream<Uint8Array> {
  let enviou = false;
  return new ReadableStream<Uint8Array>({
    pull(controle) {
      if (!enviou) {
        enviou = true;
        controle.enqueue(new Uint8Array(1024));
      }
      return new Promise(() => undefined);
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  fetchParado.mockClear();
});

describe('urlFotoAnuncioPermitida (dossiê, extra)', () => {
  it('aceita só https no CDN de imagens do ML (o host que o /items devolve)', () => {
    expect(urlFotoAnuncioPermitida(FOTO)?.href).toBe(FOTO);
    expect(urlFotoAnuncioPermitida('https://HTTP2.MLSTATIC.COM:443/D_1-O.jpg')?.href).toBe('https://http2.mlstatic.com/D_1-O.jpg');
  });

  it.each([
    ['http (sem TLS)', 'http://http2.mlstatic.com/D_1-O.jpg'],
    ['usuário e senha na frente de outro host', 'https://x.mlstatic.com@evil.example/'],
    ['usuário e senha no host do ML', 'https://usuario:senha@http2.mlstatic.com/D_1-O.jpg'],
    ['porta fora do padrão', 'https://http2.mlstatic.com:8443/D_1-O.jpg'],
    ['host do ML como subdomínio de outro', 'https://http2.mlstatic.com.evil.example/D_1-O.jpg'],
    ['host parecido', 'https://evilmlstatic.com/D_1-O.jpg'],
    ['outro subdomínio', 'https://evil.mlstatic.com/D_1-O.jpg'],
    ['ponto no fim do host', 'https://http2.mlstatic.com./D_1-O.jpg'],
    ['o domínio reservado das fotos do ML falso (e2e)', 'https://imagens.ml-falso.example/mlf-fone-01.png'],
    ['IP interno', 'https://127.0.0.1/D_1-O.jpg'],
    ['IPv6 local', 'https://[::1]/D_1-O.jpg'],
    ['metadados da nuvem', 'https://169.254.169.254/latest/meta-data/'],
    ['arquivo local', 'file:///etc/passwd'],
    ['outro protocolo', 'ftp://http2.mlstatic.com/D_1-O.jpg'],
    ['vazio', ''],
    ['texto que não é URL', 'não é uma url'],
    ['URL longa demais', `https://http2.mlstatic.com/${'a'.repeat(2100)}.jpg`],
  ])('recusa %s', (_caso, url) => {
    expect(urlFotoAnuncioPermitida(url)).toBeNull();
  });
});

describe('baixarFotoAnuncio (dossiê, extra)', () => {
  it('baixa e reduz a foto (maior lado 400 px, JPEG), sem cookie, sem autenticação e sem seguir redirecionamento', async () => {
    const fetchFn = fetchQueResponde(async () => resposta(new Uint8Array(await pngAnuncio())));
    const r = await baixarFotoAnuncio(FOTO, { fetchFn });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.max(r.imagem.largura, r.imagem.altura)).toBe(400);
    expect((await sharp(r.imagem.jpeg).metadata()).format).toBe('jpeg');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [entrada, init] = fetchFn.mock.calls[0];
    expect(entrada).toBe(FOTO);
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const cabecalhos = new Headers(init?.headers);
    expect([...cabecalhos.keys()]).toEqual(['accept']);
    expect(cabecalhos.get('accept')).toMatch(/^image\//);
  });

  it('sem URL: indisponível, sem pedido nenhum', async () => {
    const fetchFn = fetchQueResponde(() => resposta(null));
    expect(await baixarFotoAnuncio(null, { fetchFn })).toEqual({ ok: false, motivo: 'sem_url' });
    expect(await baixarFotoAnuncio('  ', { fetchFn })).toEqual({ ok: false, motivo: 'sem_url' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('host fora da lista (inclusive o truque do usuário@host): nenhum pedido sai', async () => {
    const fetchFn = fetchQueResponde(() => resposta(null));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const url of ['https://x.mlstatic.com@evil.example/', 'https://imagens.ml-falso.example/mlf-fone-01.png', 'http://http2.mlstatic.com/D_1-O.jpg', 'https://10.0.0.1/a.jpg']) {
      expect(await baixarFotoAnuncio(url, { fetchFn })).toEqual({ ok: false, motivo: 'host_nao_permitido' });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('redirecionamento para outro host: não segue (um pedido só) e fica indisponível', async () => {
    const fetchFn = fetchQueResponde(() => resposta(null, { status: 302, tipo: null, cabecalhos: { location: 'https://evil.example/foto.png' } }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'redirecionamento' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('um fetch que seguiu o redirecionamento sozinho e terminou em outro host: recusado pela URL final', async () => {
    const fetchFn = fetchQueResponde(async () => {
      const r = resposta(new Uint8Array(await pngAnuncio()));
      Object.defineProperty(r, 'url', { value: 'https://evil.example/foto.png' });
      Object.defineProperty(r, 'redirected', { value: true });
      return r;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'redirecionamento' });
  });

  it('prazo: o servidor não responde e desiste no tempo dado (padrão 5 s)', async () => {
    expect(PRAZO_FOTO_ANUNCIO_MS).toBe(5_000);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const inicio = Date.now();
    expect(await baixarFotoAnuncio(FOTO, { fetchFn: fetchParado, prazoMs: 50 })).toEqual({ ok: false, motivo: 'prazo' });
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it('prazo: o corpo começa e trava no meio', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = fetchQueResponde(() => resposta(corpoQueTrava()));
    expect(await baixarFotoAnuncio(FOTO, { fetchFn, prazoMs: 50 })).toEqual({ ok: false, motivo: 'prazo' });
  });

  it('o dossiê cancelado (o pedido foi embora ou passou do prazo) sobe como erro, não vira "indisponível"', async () => {
    const controle = new AbortController();
    const pedido = baixarFotoAnuncio(FOTO, { fetchFn: fetchParado, sinal: controle.signal });
    controle.abort(new Error('foi embora'));
    await expect(pedido).rejects.toThrow('foi embora');
    const cancelado = new AbortController();
    cancelado.abort(new Error('antes'));
    await expect(baixarFotoAnuncio(FOTO, { fetchFn: fetchParado, sinal: cancelado.signal })).rejects.toThrow('antes');
  });

  it('grande demais pelo Content-Length: nem lê o corpo', async () => {
    expect(LIMITE_BYTES_FOTO_ANUNCIO).toBe(3 * 1024 * 1024);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let lidos = 0;
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        lidos += 1;
        c.enqueue(new Uint8Array(1024));
      },
    });
    const fetchFn = fetchQueResponde(() => resposta(corpo, { cabecalhos: { 'content-length': String(LIMITE_BYTES_FOTO_ANUNCIO + 1) } }));
    expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'grande_demais' });
    expect(lidos).toBeLessThanOrEqual(1); // o stream pode pedir o 1º pedaço sozinho; ninguém lê o resto
  });

  it('grande demais sem Content-Length: para de ler ao passar do teto e cancela o corpo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let enviados = 0;
    let cancelado = false;
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        enviados += 1024;
        c.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelado = true;
      },
    });
    const fetchFn = fetchQueResponde(() => resposta(corpo));
    expect(await baixarFotoAnuncio(FOTO, { fetchFn, limiteBytes: 10 * 1024 })).toEqual({ ok: false, motivo: 'grande_demais' });
    expect(cancelado).toBe(true);
    expect(enviados).toBeLessThan(64 * 1024);
  });

  it.each([
    ['text/html', 'text/html; charset=utf-8'],
    ['SVG (texto, não foto)', 'image/svg+xml'],
    ['sem tipo', null],
  ])('tipo de conteúdo errado (%s): indisponível', async (_caso, tipo) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = fetchQueResponde(async () => resposta(new Uint8Array(await pngAnuncio()), { tipo }));
    expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'nao_e_imagem' });
  });

  it.each([404, 403, 500])('HTTP %i: indisponível', async (status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = fetchQueResponde(() => resposta('erro', { status, tipo: 'text/plain' }));
    expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'http' });
  });

  it('erro de rede: indisponível', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'rede' });
  });

  it('diz que é imagem mas não é (bytes quebrados, SVG disfarçado, imagem gigante): indisponível', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    const gigante = await sharp({ create: { width: 4200, height: 4200, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    for (const corpo of [Buffer.from('não sou uma foto'), svg, gigante]) {
      const fetchFn = fetchQueResponde(() => resposta(new Uint8Array(corpo), { tipo: 'image/jpeg' }));
      expect(await baixarFotoAnuncio(FOTO, { fetchFn })).toEqual({ ok: false, motivo: 'imagem_invalida' });
    }
  });

  it('o aviso no log tem só o host e o motivo: nunca a URL inteira com caminho e query', async () => {
    const avisos: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((m: unknown) => void avisos.push(String(m)));
    const fetchFn = fetchQueResponde(() => resposta('erro', { status: 404, tipo: 'text/plain' }));
    await baixarFotoAnuncio(`${FOTO}?token=segredo123`, { fetchFn });
    await baixarFotoAnuncio('https://x.mlstatic.com@evil.example/caminho?chave=segredo456', { fetchFn });
    expect(avisos).toHaveLength(2);
    const [http, host] = avisos.map((a) => JSON.parse(a) as Record<string, unknown>);
    expect(http).toMatchObject({ evento: 'dossie_foto_anuncio_indisponivel', host: 'http2.mlstatic.com', motivo: 'http', status: 404 });
    expect(host).toMatchObject({ evento: 'dossie_foto_anuncio_indisponivel', host: 'evil.example', motivo: 'host_nao_permitido' });
    for (const a of avisos) {
      expect(a).not.toContain('segredo');
      expect(a).not.toContain('D_611111');
      expect(a).not.toContain('caminho');
    }
  });
});
