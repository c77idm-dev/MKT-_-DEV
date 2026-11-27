import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { paginaInicial, pode, type Acao } from './permissoes';
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

/**
 * (E29) O Operador só recebe e confere: o que não é dele (o quadro, a busca, as etapas, a Nova devolução, a importação
 * de devoluções, a planilha) leva à Bancada, nas páginas e nas ações do servidor. Os outros perfis sem a permissão
 * continuam com o "não encontrada" do `exigirPermissao`.
 */
export async function exigirOuBancada(acao: Acao): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();
  if (pode(usuario.perfil, acao)) return usuario;
  if (usuario.perfil === 'OPERADOR') redirect(paginaInicial(usuario.perfil));
  notFound();
}
