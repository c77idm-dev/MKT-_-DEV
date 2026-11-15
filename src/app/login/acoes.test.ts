import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ ip: '9.9.9.9' }));
const autenticar = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': `10.0.0.1, ${estado.ip}` })),
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
// O servidor.ts começa com `import 'server-only'`, que quebra fora do Next (o mesmo mock de fluxo/conferencia/acoes.test.ts).
vi.mock('@/modules/auth/servidor', () => ({ COOKIE_SESSAO: 'sessao' }));
vi.mock('@/modules/auth/autenticar', () => ({ autenticar }));
vi.mock('@/modules/auth/sessoes', () => ({ criarSessao: vi.fn(async () => ({ token: 't', expiraEm: new Date() })), encerrarSessao: vi.fn() }));

import { limiteLoginPadrao, MENSAGEM_LIMITE_IP } from '@/modules/auth/limite-login';
import { entrar } from './acoes';

const formulario = (email: string, senha: string) => {
  const f = new FormData();
  f.set('email', email);
  f.set('senha', senha);
  return f;
};

beforeEach(() => {
  limiteLoginPadrao().limpar();
  autenticar.mockReset();
  estado.ip = '9.9.9.9';
});

describe('entrar: limite por IP', () => {
  it('depois de 20 falhas do mesmo IP, recusa sem conferir a senha; outro IP segue', async () => {
    autenticar.mockResolvedValue({ ok: false, motivo: 'credenciais' });
    for (let i = 0; i < 20; i++) expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe('E-mail ou senha incorretos.');
    autenticar.mockClear();
    expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe(MENSAGEM_LIMITE_IP);
    expect(autenticar).not.toHaveBeenCalled();
    estado.ip = '7.7.7.7';
    expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe('E-mail ou senha incorretos.');
  });

  it('o bloqueio por usuário também conta como falha do IP', async () => {
    autenticar.mockResolvedValue({ ok: false, motivo: 'bloqueado' });
    for (let i = 0; i < 20; i++) await entrar({ erro: null }, formulario('x@y.z', 'errada'));
    expect((await entrar({ erro: null }, formulario('x@y.z', 'errada'))).erro).toBe(MENSAGEM_LIMITE_IP);
  });

  it('login certo não conta', async () => {
    autenticar.mockResolvedValue({ ok: true, usuario: { id: 'u', nome: 'U', email: 'u@x', perfil: 'OPERADOR' } });
    for (let i = 0; i < 30; i++) await expect(entrar({ erro: null }, formulario('u@x', 'certa'))).rejects.toThrow('NEXT_REDIRECT');
  });
});
