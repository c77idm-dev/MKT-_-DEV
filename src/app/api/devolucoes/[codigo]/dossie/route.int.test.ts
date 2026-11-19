import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventosHistorico } from '@/db/schema';
import { criarSessao } from '@/modules/auth/sessoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../../../../tests/helpers/fabricas';
import { devolucaoComProvasTeste } from '../../../../../../tests/helpers/fabricas-dossie-banco';
import { imagensDoPdf, textoDoPdf } from '../../../../../../tests/helpers/pdf';

const estado = vi.hoisted(() => ({ token: null as string | null, negar: false, db: null as unknown }));
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

const { GET } = await import('./route');

const { db, sql } = criarDbTeste();
estado.db = db;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  estado.negar = false;
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  estado.token = (await criarSessao(db, gestor.id)).token;
});
afterAll(async () => {
  await sql.end();
});

function chamar(codigo: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/devolucoes/${encodeURIComponent(codigo)}/dossie`), { params: Promise.resolve({ codigo }) });
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

  it('antes do fim da conferência: 409 com a explicação em pt-BR', async () => {
    const p = await devolucaoComProvasTeste(db, { concluir: false });
    const r = await chamar(p.codigo);
    expect(r.status).toBe(409);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.text()).toBe('A conferência desta devolução ainda não foi concluída. O dossiê de provas fica disponível depois dela.');
    expect(await eventosDossie(p.id)).toHaveLength(0);
  });

  it('conferida: baixa o PDF (anexo, sem cache, com o tamanho) e registra "dossiê gerado" no histórico', async () => {
    const p = await devolucaoComProvasTeste(db);
    const antes = Date.now();
    const r = await chamar(p.codigo.toLowerCase());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toBe(`attachment; filename="dossie-${p.codigo}.pdf"`);
    expect(r.headers.get('cache-control')).toBe('no-store');
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

    const eventos = await eventosDossie(p.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].usuarioId).toBe(gestor.id);
    expect(eventos[0].em.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(eventos[0].dados).toMatchObject({ tamanho: bytes.length, ladoMaior: 1280, qualidade: 70 });
    expect(JSON.stringify(eventos[0].dados)).not.toContain('evidencias/');
  });

  it('todo perfil com ver_listas baixa (o Fiscal também)', async () => {
    const p = await devolucaoComProvasTeste(db);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    estado.token = (await criarSessao(db, fiscal.id)).token;
    expect((await chamar(p.codigo)).status).toBe(200);
  });
});
