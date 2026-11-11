import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { pode, type Acao } from './permissoes';
import { validarSessao } from './sessoes';
import type { UsuarioSessao } from './usuarios';

export const COOKIE_SESSAO = 'sessao';

export async function usuarioAtual(): Promise<UsuarioSessao | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  return validarSessao(obterDb(), token);
}

export async function exigirUsuario(): Promise<UsuarioSessao> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/login');
  return usuario;
}

/** Toda página e toda ação chamam esta função: a permissão é checada no servidor (spec §10). */
export async function exigirPermissao(acao: Acao): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();
  if (!pode(usuario.perfil, acao)) notFound();
  return usuario;
}
