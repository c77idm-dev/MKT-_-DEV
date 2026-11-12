'use server';

import { revalidatePath } from 'next/cache';
import { obterDb } from '@/db';
import { alterarPerfil, criarUsuarioPeloGestor, definirAtivo, ErroGestaoUsuario } from '@/modules/auth/gestao';
import { ehPerfil } from '@/modules/auth/perfis';
import { exigirPermissao } from '@/modules/auth/servidor';
import { ErroDadosUsuario, ErroEmailEmUso } from '@/modules/auth/usuarios';

/** `versao` muda a cada usuário criado: o formulário recomeça vazio. Com erro, os campos ficam como estavam. */
export type EstadoNovoUsuario = { erros: string[]; criado: string | null; versao: number };
/** `ok` diz o que deu certo, para a tela avisar ("Perfil de X salvo."). */
export type EstadoAcaoUsuario = { erro: string | null; ok: 'perfil' | 'desativado' | 'reativado' | null };

function ehErroConhecido(erro: unknown): erro is Error {
  return erro instanceof ErroDadosUsuario || erro instanceof ErroEmailEmUso || erro instanceof ErroGestaoUsuario;
}

export async function criarUsuarioAcao(anterior: EstadoNovoUsuario, dados: FormData): Promise<EstadoNovoUsuario> {
  const gestor = await exigirPermissao('administrar');
  const perfil = String(dados.get('perfil') ?? '');
  if (!ehPerfil(perfil)) return { ...anterior, erros: ['Escolha o perfil.'], criado: null };
  try {
    const novo = await criarUsuarioPeloGestor(
      obterDb(),
      { nome: String(dados.get('nome') ?? ''), email: String(dados.get('email') ?? ''), senha: String(dados.get('senha') ?? ''), perfil },
      gestor,
    );
    revalidatePath('/configuracoes/usuarios');
    return { erros: [], criado: novo.nome, versao: anterior.versao + 1 };
  } catch (erro) {
    if (ehErroConhecido(erro)) return { ...anterior, erros: [erro.message], criado: null };
    throw erro;
  }
}

export async function alterarPerfilAcao(alvoId: string, _anterior: EstadoAcaoUsuario, dados: FormData): Promise<EstadoAcaoUsuario> {
  const gestor = await exigirPermissao('administrar');
  try {
    await alterarPerfil(obterDb(), alvoId, String(dados.get('perfil') ?? ''), gestor);
  } catch (erro) {
    if (ehErroConhecido(erro)) return { erro: erro.message, ok: null };
    throw erro;
  }
  revalidatePath('/configuracoes/usuarios');
  return { erro: null, ok: 'perfil' };
}

/** Usada com `.bind(null, id, ativo)`: o estado anterior e o formulário não são necessários. */
export async function definirAtivoAcao(alvoId: string, ativo: boolean): Promise<EstadoAcaoUsuario> {
  const gestor = await exigirPermissao('administrar');
  try {
    await definirAtivo(obterDb(), alvoId, ativo === true, gestor);
  } catch (erro) {
    if (ehErroConhecido(erro)) return { erro: erro.message, ok: null };
    throw erro;
  }
  revalidatePath('/configuracoes/usuarios');
  return { erro: null, ok: ativo === true ? 'reativado' : 'desativado' };
}
