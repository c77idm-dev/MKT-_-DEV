import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sessoes, usuarios } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarSessao, DURACAO_SESSAO_MS, encerrarSessao, idDaSessao, validarSessao } from './sessoes';
import { criarUsuario, type UsuarioSessao } from './usuarios';

const { db, sql } = criarDbTeste();
let usuario: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  usuario = await criarUsuario(db, { nome: 'Ana', email: 'ana@empresa.com', senha: 'senha-segura-123', perfil: 'FISCAL' });
});
afterAll(async () => {
  await sql.end();
});

describe('sessões', () => {
  it('cria e valida uma sessão, guardando só o hash do token', async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const { token, expiraEm } = await criarSessao(db, usuario.id, agora);

    expect(expiraEm.getTime()).toBe(agora.getTime() + DURACAO_SESSAO_MS);
    const [linha] = await db.select().from(sessoes);
    expect(linha.id).toBe(idDaSessao(token));
    expect(linha.id).not.toBe(token);
    expect(await validarSessao(db, token, agora)).toEqual(usuario);
  });

  it('recusa e apaga a sessão expirada', async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    const { token } = await criarSessao(db, usuario.id, agora);
    const depois = new Date(agora.getTime() + DURACAO_SESSAO_MS + 1);

    expect(await validarSessao(db, token, depois)).toBeNull();
    expect(await db.select().from(sessoes)).toHaveLength(0);
  });

  it('recusa a sessão de usuário desativado', async () => {
    const { token } = await criarSessao(db, usuario.id);
    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, usuario.id));
    expect(await validarSessao(db, token)).toBeNull();
  });

  it('recusa token desconhecido e token vazio', async () => {
    expect(await validarSessao(db, 'token-que-nao-existe')).toBeNull();
    expect(await validarSessao(db, '')).toBeNull();
  });

  it('encerra a sessão', async () => {
    const { token } = await criarSessao(db, usuario.id);
    await encerrarSessao(db, token);
    expect(await validarSessao(db, token)).toBeNull();
  });
});
