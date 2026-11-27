import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Perfil } from './perfis';

const mocks = vi.hoisted(() => ({
  token: 't' as string | undefined,
  usuario: null as null | { id: string; nome: string; email: string; perfil: Perfil },
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => (mocks.token ? { value: mocks.token } : undefined) })) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT ${destino}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('./sessoes', () => ({ validarSessao: vi.fn(async () => mocks.usuario) }));

import { exigirOuBancada } from './servidor';

const usuario = (perfil: Perfil) => ({ id: 'u1', nome: 'U', email: 'u@x', perfil });

beforeEach(() => {
  mocks.token = 't';
  mocks.usuario = null;
});

describe('exigirOuBancada (E29)', () => {
  it('o Operador sem a permissão vai para a Bancada (não para a página "não encontrada")', async () => {
    mocks.usuario = usuario('OPERADOR');
    await expect(exigirOuBancada('acompanhar')).rejects.toThrow('NEXT_REDIRECT /bancada');
    await expect(exigirOuBancada('cadastrar_devolucoes')).rejects.toThrow('NEXT_REDIRECT /bancada');
  });

  it('quem tem a permissão segue com o usuário', async () => {
    mocks.usuario = usuario('GESTOR');
    await expect(exigirOuBancada('acompanhar')).resolves.toEqual(usuario('GESTOR'));
    await expect(exigirOuBancada('cadastrar_devolucoes')).resolves.toEqual(usuario('GESTOR'));
    mocks.usuario = usuario('FISCAL');
    await expect(exigirOuBancada('acompanhar')).resolves.toEqual(usuario('FISCAL'));
    mocks.usuario = usuario('OPERADOR');
    await expect(exigirOuBancada('operar_devolucoes')).resolves.toEqual(usuario('OPERADOR'));
  });

  it('os outros perfis sem a permissão continuam com o "não encontrada" de hoje', async () => {
    mocks.usuario = usuario('FISCAL');
    await expect(exigirOuBancada('cadastrar_devolucoes')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sem sessão, vai para o login', async () => {
    mocks.token = undefined;
    await expect(exigirOuBancada('acompanhar')).rejects.toThrow('NEXT_REDIRECT /login');
  });
});
