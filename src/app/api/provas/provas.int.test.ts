import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidencias } from '@/db/schema';
import { lerEnv } from '@/lib/env';
import { criarSessao } from '@/modules/auth/sessoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { chaveEvidencia } from '@/modules/midia/chaves';
import type { TipoEvidencia } from '@/modules/midia/dominio';
import { assinarLink } from '@/modules/midia/links';
import { assinarLinkPublico, DURACAO_LINK_PUBLICO_SEGUNDOS, parametrosLinkPublico } from '@/modules/midia/links-publicos';
import { criarRetirada } from '@/modules/retiradas/retiradas';
import { criarDbTeste, limparTabelas } from '../../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../../tests/helpers/fabricas';

const estado = vi.hoisted(() => ({ token: null as string | null, db: null as unknown }));
// O servidor.ts (usado pelo /api/arquivos) começa com `import 'server-only'`, que quebra fora do Next.
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (nome: string) => (nome === 'sessao' && estado.token ? { name: nome, value: estado.token } : undefined) }),
}));
vi.mock('@/db', () => ({ obterDb: () => estado.db }));

const arquivo = await import('./arquivo/route');
const video = await import('./video/route');
const sessao = await import('../arquivos/route');

const { db, sql } = criarDbTeste();
estado.db = db;
const SEGREDO = lerEnv().SEGREDO_LINKS;
const FOTO = Buffer.from('jpeg-de-teste-'.repeat(20));
const VIDEO = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256));
let pasta: string;
let operador: UsuarioSessao;
let devolucaoId: string;
let codigo: string;

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'provas-publicas-'));
  // A rota lê do disco local (MIDIA_DIR), como o /api/arquivos.
  vi.stubEnv('MIDIA_DIR', pasta);
  estado.token = null;
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  const d = await criarDevolucaoTeste(db, operador);
  devolucaoId = d.id;
  codigo = d.codigo;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

/**
 * Evidência com o arquivo no disco (MIDIA_DIR), como o worker deixa. O padrão é uma foto extra do pacote (pode haver
 * várias na mesma devolução); o Vídeo de Prova é um por devolução (`outraDevolucao` cria outra).
 */
async function prova(
  p: {
    tipo?: TipoEvidencia;
    conteudo?: Buffer;
    situacao?: 'PRONTA' | 'PROCESSANDO' | 'APAGADA';
    provedor?: string;
    caminho?: string;
    dono?: { retiradaId: string };
    outraDevolucao?: boolean;
  } = {},
): Promise<{ id: string; caminho: string }> {
  const id = randomUUID();
  const tipo = p.tipo ?? 'EXTRA';
  const videoProva = tipo === 'VIDEO_PROVA';
  const devolucao = p.outraDevolucao ? (await criarDevolucaoTeste(db, operador)).id : devolucaoId;
  const dono = p.dono ? p.dono.retiradaId : devolucao;
  const caminho = p.caminho ?? chaveEvidencia(dono, id, videoProva ? 'mp4' : 'jpg');
  const conteudo = p.conteudo ?? (videoProva ? VIDEO : FOTO);
  const absoluto = join(pasta, caminho);
  if (absoluto.startsWith(pasta)) {
    await mkdir(dirname(absoluto), { recursive: true });
    await writeFile(absoluto, conteudo);
  }
  await db.insert(evidencias).values({
    id,
    ...(p.dono ? { retiradaId: p.dono.retiradaId } : { devolucaoId: devolucao }),
    tipo,
    tipoConteudo: videoProva ? 'video/mp4' : 'image/jpeg',
    caminho,
    provedor: p.provedor ?? 'disco',
    tamanhoOriginal: conteudo.length,
    tamanho: conteudo.length,
    sha256Original: 'a'.repeat(64),
    sha256Final: 'b'.repeat(64),
    situacaoProcessamento: p.situacao ?? 'PRONTA',
    idCliente: randomUUID(),
    enviadoPor: operador.id,
  });
  return { id, caminho };
}

function url(rota: 'arquivo' | 'video', query: string | URLSearchParams): string {
  return `https://devolucoes.exemplo.com.br/api/provas/${rota}?${query.toString()}`;
}

function pedirArquivo(query: string | URLSearchParams, headers: Record<string, string> = {}, metodo: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  const req = new Request(url('arquivo', query), { method: metodo, headers });
  return metodo === 'GET' ? arquivo.GET(req) : arquivo.HEAD(req);
}

function pedirVideo(query: string | URLSearchParams): Promise<Response> {
  return video.GET(new Request(url('video', query)));
}

const linkDe = (id: string, agora = new Date()) => parametrosLinkPublico(SEGREDO, id, agora);

function esperarSegurancaDoArquivo(r: Response): void {
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
  expect(r.headers.get('referrer-policy')).toBe('no-referrer');
  expect(r.headers.get('x-robots-tag')).toBe('noindex');
  expect(r.headers.get('set-cookie')).toBeNull();
}

async function esperarAviso(r: Response, status: number, trecho: RegExp): Promise<void> {
  expect(r.status).toBe(status);
  expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'");
  const html = await r.text();
  expect(html).toContain('<html lang="pt-BR">');
  expect(html).toContain('name="viewport"');
  expect(html).toMatch(trecho);
}

describe('GET /api/provas/arquivo (E28: link público, sem login)', () => {
  it('foto: 200 sem sessão, o arquivo inteiro e os cabeçalhos de segurança do /api/arquivos', async () => {
    const f = await prova();
    const r = await pedirArquivo(linkDe(f.id));
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer()).equals(FOTO)).toBe(true);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect(r.headers.get('content-disposition')).toBe('inline');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-length')).toBe(String(FOTO.length));
    esperarSegurancaDoArquivo(r);
  });

  it('vídeo: Range devolve 206 com o pedaço (o <video> do navegador pede assim); sem Range, 200', async () => {
    const v = await prova({ tipo: 'VIDEO_PROVA' });
    const pedaco = await pedirArquivo(linkDe(v.id), { range: 'bytes=0-99' });
    expect(pedaco.status).toBe(206);
    expect(pedaco.headers.get('content-range')).toBe(`bytes 0-99/${VIDEO.length}`);
    expect(pedaco.headers.get('content-length')).toBe('100');
    expect(Buffer.from(await pedaco.arrayBuffer()).equals(VIDEO.subarray(0, 100))).toBe(true);
    expect(pedaco.headers.get('content-type')).toBe('video/mp4');
    expect(pedaco.headers.get('content-disposition')).toBe('inline');
    esperarSegurancaDoArquivo(pedaco);
    // O cache do vídeo (para o Range) nunca passa dos 10 minutos do link de sessão, mesmo com 90 dias de link.
    const maxAge = Number(/^private, max-age=(\d+)$/.exec(pedaco.headers.get('cache-control') ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(600);

    const fim = await pedirArquivo(linkDe(v.id), { range: 'bytes=-10' });
    expect(fim.status).toBe(206);
    expect(Buffer.from(await fim.arrayBuffer()).equals(VIDEO.subarray(VIDEO.length - 10))).toBe(true);

    const inteiro = await pedirArquivo(linkDe(v.id));
    expect(inteiro.status).toBe(200);
    expect((await inteiro.arrayBuffer()).byteLength).toBe(VIDEO.length);

    expect((await pedirArquivo(linkDe(v.id), { range: `bytes=${VIDEO.length}-` })).status).toBe(416);
  });

  it('HEAD: os mesmos cabeçalhos, sem corpo', async () => {
    const v = await prova({ tipo: 'VIDEO_PROVA' });
    const r = await pedirArquivo(linkDe(v.id), {}, 'HEAD');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-length')).toBe(String(VIDEO.length));
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.body).toBeNull();
  });

  it('adulterado ou incompleto: 403 com a explicação em pt-BR', async () => {
    const f = await prova();
    const certo = linkDe(f.id);
    const trocar = (chave: string, valor: string) => {
      const p = new URLSearchParams(certo);
      p.set(chave, valor);
      return p;
    };
    const sig = certo.get('sig')!;
    for (const q of [
      trocar('sig', `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`),
      trocar('exp', String(Number(certo.get('exp')) - 1)),
      trocar('e', randomUUID()),
      'e=&exp=&sig=',
      '',
    ]) {
      await esperarAviso(await pedirArquivo(q), 403, /link não é válido/);
    }
  });

  it('expirado (90 dias depois): 410, pede para gerar o dossiê de novo', async () => {
    const f = await prova();
    const antigo = linkDe(f.id, new Date(Date.now() - DURACAO_LINK_PUBLICO_SEGUNDOS * 1000 - 1000));
    await esperarAviso(await pedirArquivo(antigo), 410, /expirou[\s\S]*Gere o dossiê de provas \(PDF\) de novo/);
    await esperarAviso(await pedirVideo(antigo), 410, /expirou/);
  });

  it('domínio separado: a assinatura de sessão não abre a rota pública', async () => {
    const f = await prova();
    const exp = Math.floor(Date.now() / 1000) + 600;
    // A assinatura do link de sessão (links.ts), sobre o mesmo id e prazo.
    const q = new URLSearchParams({ e: f.id, exp: String(exp), sig: assinarLink(SEGREDO, f.id, exp) });
    await esperarAviso(await pedirArquivo(q), 403, /link não é válido/);
    // E o link de sessão inteiro, como sai do armazenamento (c, exp, sig), também não.
    const deSessao = new URLSearchParams({ c: f.caminho, exp: String(exp), sig: assinarLink(SEGREDO, f.caminho, exp) });
    await esperarAviso(await pedirArquivo(deSessao), 403, /link não é válido/);
  });

  it('domínio separado: a assinatura pública não abre o /api/arquivos (nem com sessão)', async () => {
    const f = await prova();
    estado.token = (await criarSessao(db, operador.id)).token;
    const exp = Math.floor(Date.now() / 1000) + 600;
    const comSessao = (sig: string) =>
      sessao.GET(new Request(`https://devolucoes.exemplo.com.br/api/arquivos?${new URLSearchParams({ c: f.caminho, exp: String(exp), sig })}`));
    expect((await comSessao(assinarLinkPublico(SEGREDO, f.caminho, exp))).status).toBe(403);
    expect((await comSessao(assinarLinkPublico(SEGREDO, f.id, exp))).status).toBe(403);
    // O link de sessão de verdade abre (o teste acima não falhou por outro motivo).
    expect((await comSessao(assinarLink(SEGREDO, f.caminho, exp))).status).toBe(200);
  });

  it('só arquivo de evidência pronta de devolução, no disco e na chave dela: o resto é 404', async () => {
    const retirada = await criarRetirada(db, 'FULLPUB1', operador);
    const casos = [
      await prova({ situacao: 'PROCESSANDO' }),
      await prova({ situacao: 'APAGADA' }),
      await prova({ provedor: 's3' }),
      // Foto da retirada do Full: não vai em dossiê nenhum.
      await prova({ dono: { retiradaId: retirada.id } }),
      // Caminho do banco fora da chave da evidência (travessia, outra pasta, outra evidência).
      await prova({ caminho: 'evidencias/../../segredo.txt' }),
      await prova({ caminho: `notas-venda/${devolucaoId}/${randomUUID()}.xml` }),
      await prova({ caminho: chaveEvidencia(devolucaoId, randomUUID(), 'jpg') }),
      // A chave de outra devolução (a evidência é desta).
      await prova({ caminho: chaveEvidencia(randomUUID(), randomUUID(), 'jpg') }),
    ];
    for (const c of casos) await esperarAviso(await pedirArquivo(linkDe(c.id)), 404, /Arquivo não encontrado/);
    // Evidência que não existe (apagada ao refazer a foto).
    await esperarAviso(await pedirArquivo(linkDe(randomUUID())), 404, /Arquivo não encontrado/);
    // Arquivo sumido do disco.
    const sumido = await prova();
    await rm(join(pasta, sumido.caminho));
    await esperarAviso(await pedirArquivo(linkDe(sumido.id)), 404, /Arquivo não encontrado/);
    expect(await db.select().from(evidencias).where(eq(evidencias.id, sumido.id))).toHaveLength(1);
  });
});

describe('GET /api/provas/video (E28: o vídeo toca no navegador, sem login)', () => {
  it('página curta com o <video controls playsinline preload="metadata"> apontando para o arquivo', async () => {
    const v = await prova({ tipo: 'VIDEO_PROVA' });
    const link = linkDe(v.id);
    const r = await pedirVideo(link);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    // O sandbox fica, numa origem opaca (sem allow-same-origin). O "allow-scripts" é só para os controles do player do
    // Safari/WebKit, que são feitos em script pelo próprio navegador (sem ele, o WebKit mostra o vídeo sem controles).
    // Nenhum script da página roda: default-src 'none' e nenhum script-src. O player ganha só o vídeo do próprio
    // sistema e o estilo da página.
    const csp = r.headers.get('content-security-policy')!;
    expect(csp).toMatch(
      /^sandbox allow-scripts; default-src 'none'; media-src 'self'( https:\/\/devolucoes\.exemplo\.com\.br)?; style-src 'unsafe-inline'$/,
    );
    expect(csp).not.toMatch(/script-src|allow-same-origin|unsafe-eval/);
    const html = await r.text();
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain(`Vídeo de Prova · ${codigo}`);
    const src = `/api/provas/arquivo?${link.toString()}`.replace(/&/g, '&amp;');
    expect(html).toContain(`<video controls playsinline preload="metadata" src="${src}">`);
    expect(html).not.toContain('<script');
  });

  it('foto, adulterado ou sem vídeo pronto: não abre o player', async () => {
    const f = await prova();
    await esperarAviso(await pedirVideo(linkDe(f.id)), 404, /Vídeo não encontrado/);
    const processando = await prova({ tipo: 'VIDEO_PROVA', situacao: 'PROCESSANDO', outraDevolucao: true });
    await esperarAviso(await pedirVideo(linkDe(processando.id)), 404, /Vídeo não encontrado/);
    const v = await prova({ tipo: 'VIDEO_PROVA' });
    const q = linkDe(v.id);
    q.set('exp', String(Number(q.get('exp')) - 5));
    await esperarAviso(await pedirVideo(q), 403, /link não é válido/);
  });
});
