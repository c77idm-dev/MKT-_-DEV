'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { autenticar } from '@/modules/auth/autenticar';
import { COOKIE_SESSAO } from '@/modules/auth/servidor';
import { criarSessao, encerrarSessao } from '@/modules/auth/sessoes';

export type EstadoLogin = { erro: string | null };

export async function entrar(_anterior: EstadoLogin, formulario: FormData): Promise<EstadoLogin> {
  const email = String(formulario.get('email') ?? '');
  const senha = String(formulario.get('senha') ?? '');
  if (!email || !senha) return { erro: 'Informe e-mail e senha.' };

  const db = obterDb();
  const resultado = await autenticar(db, email, senha);
  if (!resultado.ok) {
    return {
      erro:
        resultado.motivo === 'bloqueado'
          ? 'Acesso bloqueado por muitas tentativas. Tente de novo em 15 minutos.'
          : 'E-mail ou senha incorretos.',
    };
  }

  const { token, expiraEm } = await criarSessao(db, resultado.usuario.id);
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  });
  redirect('/fluxo');
}

export async function sair(): Promise<void> {
  const loja = await cookies();
  const token = loja.get(COOKIE_SESSAO)?.value;
  if (token) await encerrarSessao(obterDb(), token);
  loja.delete(COOKIE_SESSAO);
  redirect('/login');
}
