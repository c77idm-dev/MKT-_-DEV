import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventosHistorico } from '@/db/schema';
import { criarSessao } from '@/modules/auth/sessoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { ErroPrazoEsgotado } from '@/modules/dossie/serie';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { criarDbTeste, limparTabelas } from '../../../../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../../../../tests/helpers/fabricas';
import { devolucaoComProvasTeste } from '../../../../../../tests/helpers/fabricas-dossie-banco';
import { imagensDoPdf, textoDoPdf } from '../../../../../../tests/helpers/pdf';

const estado = vi.hoisted(() => ({ token: null as string | null, negar: false, db: null as unknown, falhaGerar: null as unknown }));
// O servidor.ts começa com `import 'server-only'`, que quebra fora do Next.
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (nome: string) => (nome === 'sessao' && estado.token ? { name: nome, value: estado.token } : undefined) }),
}));
vi.mock('@/db', () => ({ obterDb: () => estado.db }));
// "Permissão errada": todos os perfis têm ver_listas; o teste nega a permissão para ver a ordem das checagens.
vi.mock('@/modules/auth/permissoes', async (original) => {
  const real = await original<typeof import('@/modules/auth/permissoes')>();
  return { ...real, pode: (...a: Parameters<typeof real.pode>) => (estado.negar ? false : real.pode(...a)) };
});
// O prazo do dossiê é de 100 s: o teste simula o estouro direto na geração.
vi.mock('@/modules/dossie/gerar', async (original) => {
  const real = await original<typeof import('@/modules/dossie/gerar')>();
  return {
    ...real,
    gerarDossie: (...a: Parameters<typeof real.gerarDossie>) => (estado.falhaGerar ? Promise.reject(estado.falhaGerar) : real.gerarDossie(...a)),
  };
});

const { GET, HEAD } = await import('./route');

const { db, sql } = criarDbTeste();
estado.db = db;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  estado.negar = false;
  estado.falhaGerar = null;
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  estado.token = (await criarSessao(db, gestor.id)).token;
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

function pedido(codigo: string, o: { query?: string; headers?: Record<string, string>; sinal?: AbortSignal } = {}): Request {
  return new Request(`http://localhost/api/devolucoes/${encodeURIComponent(codigo)}/dossie${o.query ?? ''}`, { headers: o.headers, signal: o.sinal });
}

function chamar(codigo: string, o: { query?: string; headers?: Record<string, string>; sinal?: AbortSignal } = {}): Promise<Response> {
  return GET(pedido(codigo, o), { params: Promise.resolve({ codigo }) });
}

/** O Next transforma redirect() e notFound() da rota em 307 e 404; fora dele, sobra o digest do erro. */
async function interrupcao(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (erro) {
    return String((erro as { digest?: unknown }).digest ?? erro);
  }
  return 'respondeu';
}

async function eventosDossie(devolucaoId: string) {
  return db
    .select()
    .from(eventosHistorico)
    .where(and(eq(eventosHistorico.entidade, 'devolucao'), eq(eventosHistorico.entidadeId, devolucaoId), eq(eventosHistorico.acao, 'dossie_gerado')));
}

/** O PDF nunca abre na origem do app (como a rota /api/arquivos). */
function esperarCabecalhosDeSeguranca(r: Response): void {
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('content-security-policy')).toMatch(/^sandbox/);
  expect(r.headers.get('cache-control')).toBe('no-store');
}

/** Nada de chave de mídia, link assinado ou id interno no que vai para fora. */
const PROIBIDO_NO_PDF = /evidencias\/|\/api\/arquivos|X-Amz-|sig=|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('GET /api/devolucoes/[codigo]/dossie (extra)', () => {
  it('sem sessão: manda para o login, antes de olhar o código', async () => {
    estado.token = null;
    expect(await interrupcao(chamar('DEV-000001'))).toMatch(/^NEXT_REDIRECT;.*;\/login;307;/);
    expect(await interrupcao(chamar('nada-a-ver'))).toMatch(/^NEXT_REDIRECT;.*;\/login;307;/);
  });

  it('sem a permissão ver_listas: 404 antes de ler a devolução (nada gerado nem registrado)', async () => {
    const p = await devolucaoComProvasTeste(db);
    estado.negar = true;
    expect(await interrupcao(chamar(p.codigo))).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(await eventosDossie(p.id)).toHaveLength(0);
  });

  it('código fora do formato ou desconhecido: 404', async () => {
    for (const codigo of ['DEV-12', 'LOT-000001', '../../etc', 'DEV-000001;drop', 'DEV-999999']) {
      expect(await interrupcao(chamar(codigo)), codigo).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    }
  });

  it('antes do fim da conferência: 409 com a explicação em pt-BR e o caminho de volta', async () => {
    const p = await devolucaoComProvasTeste(db, { concluir: false });
    const r = await chamar(p.codigo);
    expect(r.status).toBe(409);
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    esperarCabecalhosDeSeguranca(r);
    const html = await r.text();
    expect(html).toContain('A conferência desta devolução ainda não foi concluída. O dossiê de provas fica disponível depois dela.');
    expect(html).toContain(`href="/fluxo/devolucoes/${p.codigo}"`);
    expect(await eventosDossie(p.id)).toHaveLength(0);
  });

  it('conferida: baixa o PDF (anexo, sem cache, com o tamanho) e registra "dossiê gerado" no histórico', async () => {
    const p = await devolucaoComProvasTeste(db);
    const antes = Date.now();
    const r = await chamar(p.codigo.toLowerCase());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toBe(`attachment; filename="dossie-${p.codigo}.pdf"`);
    esperarCabecalhosDeSeguranca(r);
    expect(r.headers.get('set-cookie')).toBeNull();
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(r.headers.get('x-dossie-tamanho')).toBe(String(bytes.length));
    expect(r.headers.get('content-length')).toBe(String(bytes.length));
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
    // 5 fotos de verdade; o "vídeo" da fábrica não é vídeo: aviso no lugar do quadro, sem quebrar o PDF.
    expect(await imagensDoPdf(bytes)).toHaveLength(5);
    const texto = await textoDoPdf(bytes);
    expect(texto).toContain(p.codigo);
    expect(texto).toContain(p.reclamacaoId);
    expect(texto).toContain('Não foi possível tirar um quadro do vídeo.');
    expect(texto).toContain(`gerado em`);
    expect(texto).toContain(gestor.nome);
    // Nada de chave de mídia, link assinado ou id interno, nem no texto nem nos metadados.
    expect(texto).not.toMatch(PROIBIDO_NO_PDF);
    const doc = await PDFDocument.load(bytes);
    for (const meta of [doc.getTitle(), doc.getAuthor(), doc.getSubject(), doc.getCreator(), doc.getProducer(), doc.getKeywords()]) {
      expect(meta ?? '').not.toMatch(PROIBIDO_NO_PDF);
    }
    expect(doc.getTitle()).toBe(`Dossiê de provas ${p.codigo}`);
    expect(doc.getAuthor()).toBe('Loja Exemplo Ltda');

    const eventos = await eventosDossie(p.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].usuarioId).toBe(gestor.id);
    expect(eventos[0].em.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(eventos[0].dados).toMatchObject({ tamanho: bytes.length, ladoMaior: 1280, qualidade: 70 });
    expect(JSON.stringify(eventos[0].dados)).not.toContain('evidencias/');
  });

  it('vídeo que quebra no meio da leitura: o PDF sai assim mesmo, com o aviso no Vídeo de Prova', async () => {
    const p = await devolucaoComProvasTeste(db);
    const armazenamento = obterArmazenamento();
    const ler = armazenamento.ler.bind(armazenamento);
    vi.spyOn(armazenamento, 'ler').mockImplementation(async (caminho) => {
      if (caminho !== p.evidencias.video.caminho) return ler(caminho);
      let enviados = 0;
      return new Readable({
        read() {
          enviados += 1;
          if (enviados === 1) this.push(Buffer.alloc(512, 1));
          else this.destroy(new Error('ECONNRESET'));
        },
      });
    });
    const r = await chamar(p.codigo);
    expect(r.status).toBe(200);
    expect(await textoDoPdf(new Uint8Array(await r.arrayBuffer()))).toContain('Não foi possível ler o arquivo do vídeo.');
  });

  it('marca do botão (?n=): o PDF pronto devolve o cookie que encerra o "Gerando…" na tela; marca inválida é ignorada', async () => {
    const p = await devolucaoComProvasTeste(db);
    const r = await chamar(p.codigo, { query: '?n=0123456789abcdef' });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBe('dossie_0123456789abcdef=1; Max-Age=120; Path=/; SameSite=Lax');
    for (const ruim of ['?n=x;%20Path=/', '?n=0123', '?n=0123456789ABCDEF']) {
      expect((await chamar(p.codigo, { query: ruim })).headers.get('set-cookie'), ruim).toBeNull();
    }
  });

  it('pedido de outro site (Sec-Fetch-Site: cross-site): 403, nada gerado nem registrado', async () => {
    const p = await devolucaoComProvasTeste(db);
    const r = await chamar(p.codigo, { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(r.status).toBe(403);
    esperarCabecalhosDeSeguranca(r);
    expect(await r.text()).toBe('Pedido de outro site recusado.');
    expect(await eventosDossie(p.id)).toHaveLength(0);
    // O toque no app (same-origin) e a URL digitada (none) passam.
    expect((await chamar(p.codigo, { headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(200);
    expect((await chamar(p.codigo, { headers: { 'sec-fetch-site': 'none' } })).status).toBe(200);
  });

  it('HEAD (prévia de link, gerenciador de downloads): 405, sem gerar nem registrar', async () => {
    const p = await devolucaoComProvasTeste(db);
    const r = await HEAD();
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('GET');
    expect(await eventosDossie(p.id)).toHaveLength(0);
  });

  it('pedido que foi embora (antes ou no meio da geração): nada registrado', async () => {
    const p = await devolucaoComProvasTeste(db);
    const antes = new AbortController();
    antes.abort();
    expect((await chamar(p.codigo, { sinal: antes.signal })).status).toBe(499);

    const meio = new AbortController();
    const armazenamento = obterArmazenamento();
    const ler = armazenamento.ler.bind(armazenamento);
    const lidos: string[] = [];
    vi.spyOn(armazenamento, 'ler').mockImplementation(async (caminho) => {
      lidos.push(caminho);
      meio.abort();
      return ler(caminho);
    });
    expect((await chamar(p.codigo, { sinal: meio.signal })).status).toBe(499);
    expect(lidos).toHaveLength(1);
    expect(await eventosDossie(p.id)).toHaveLength(0);
  });

  it('toques repetidos da mesma pessoa juntam numa geração só (um evento, cada arquivo lido uma vez)', async () => {
    const p = await devolucaoComProvasTeste(db);
    const armazenamento = obterArmazenamento();
    const lidos: string[] = [];
    const ler = armazenamento.ler.bind(armazenamento);
    vi.spyOn(armazenamento, 'ler').mockImplementation(async (caminho) => {
      lidos.push(caminho);
      return ler(caminho);
    });
    const [a, b] = await Promise.all([chamar(p.codigo), chamar(p.codigo)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await a.arrayBuffer()).byteLength).toBe((await b.arrayBuffer()).byteLength);
    expect(lidos).toHaveLength(6); // 5 fotos e o vídeo
    expect(await eventosDossie(p.id)).toHaveLength(1);
  });

  it('fila cheia (um dossiê rodando e outro esperando): 503 com Retry-After e a explicação', async () => {
    const [a, b, c] = [await devolucaoComProvasTeste(db), await devolucaoComProvasTeste(db), await devolucaoComProvasTeste(db)];
    const armazenamento = obterArmazenamento();
    const ler = armazenamento.ler.bind(armazenamento);
    let soltar!: () => void;
    const portao = new Promise<void>((ok) => {
      soltar = ok;
    });
    const lidos: string[] = [];
    vi.spyOn(armazenamento, 'ler').mockImplementation(async (caminho) => {
      lidos.push(caminho);
      await portao;
      return ler(caminho);
    });
    const rodando = chamar(a.codigo);
    try {
      await vi.waitFor(() => expect(lidos.length).toBeGreaterThan(0));
      // A está rodando (preso no armazenamento): entre B e C, um entra na fila e o outro é recusado na hora.
      const pb = chamar(b.codigo);
      const pc = chamar(c.codigo);
      const recusado = await Promise.race([pb, pc]);
      expect(recusado.status).toBe(503);
      expect(recusado.headers.get('retry-after')).toBe('30');
      expect(recusado.headers.get('content-type')).toBe('text/html; charset=utf-8');
      esperarCabecalhosDeSeguranca(recusado);
      expect(await recusado.text()).toContain('Outro dossiê está sendo gerado. Tente de novo em instantes.');
      soltar();
      expect((await rodando).status).toBe(200);
      expect([(await pb).status, (await pc).status].sort()).toEqual([200, 503]);
      expect((await eventosDossie(b.id)).length + (await eventosDossie(c.id)).length).toBe(1);
    } finally {
      soltar();
    }
  });

  it('dossiê que passou do prazo: 503 com a explicação', async () => {
    const p = await devolucaoComProvasTeste(db);
    estado.falhaGerar = new ErroPrazoEsgotado();
    const r = await chamar(p.codigo);
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBe('30');
    expect(await r.text()).toContain('O dossiê demorou demais para ficar pronto. Tente de novo em instantes.');
  });

  it('todo perfil com ver_listas baixa (o Fiscal também)', async () => {
    const p = await devolucaoComProvasTeste(db);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    estado.token = (await criarSessao(db, fiscal.id)).token;
    expect((await chamar(p.codigo)).status).toBe(200);
  });
});
