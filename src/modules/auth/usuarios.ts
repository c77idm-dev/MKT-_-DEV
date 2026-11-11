import { z } from 'zod';
import type { Db } from '@/db/client';
import { usuarios } from '@/db/schema';
import { PERFIS, type Perfil } from './perfis';
import { gerarHashSenha, TAMANHO_MINIMO_SENHA } from './senha';

export type UsuarioSessao = { id: string; nome: string; email: string; perfil: Perfil };

export class ErroEmailEmUso extends Error {
  constructor(email: string) {
    super(`Já existe um usuário com o e-mail ${email}`);
    this.name = 'ErroEmailEmUso';
  }
}

const esquemaNovoUsuario = z.object({
  nome: z.string().trim().min(1, 'Informe o nome'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  senha: z.string().min(TAMANHO_MINIMO_SENHA, `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`),
  perfil: z.enum(PERFIS),
});

export type DadosNovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil };

export async function criarUsuario(db: Db, dados: DadosNovoUsuario): Promise<UsuarioSessao> {
  const resultado = esquemaNovoUsuario.safeParse(dados);
  if (!resultado.success) {
    throw new Error(resultado.error.issues.map((i) => i.message).join('; '));
  }
  const d = resultado.data;
  const senhaHash = await gerarHashSenha(d.senha);
  try {
    const [criado] = await db
      .insert(usuarios)
      .values({ nome: d.nome, email: d.email, senhaHash, perfil: d.perfil })
      .returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil });
    return criado;
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroEmailEmUso(d.email);
    throw erro;
  }
}

function codigoDoErro(x: unknown): unknown {
  return typeof x === 'object' && x !== null && 'code' in x ? (x as { code?: unknown }).code : undefined;
}

/** 23505 = unique_violation. Versões recentes do Drizzle embrulham o erro do driver em `cause`. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const causa = typeof erro === 'object' && erro !== null ? (erro as { cause?: unknown }).cause : undefined;
  return codigoDoErro(erro) === '23505' || codigoDoErro(causa) === '23505';
}
