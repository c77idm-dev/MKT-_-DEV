import { z } from 'zod';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
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

/** Dado inválido no cadastro do usuário (mensagem pronta para a tela). */
export class ErroDadosUsuario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDadosUsuario';
  }
}

const esquemaNovoUsuario = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(120, 'Nome: no máximo 120 caracteres'),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254, 'E-mail: no máximo 254 caracteres'),
  senha: z.string().min(TAMANHO_MINIMO_SENHA, `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`),
  perfil: z.enum(PERFIS),
});

export type DadosNovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil };

export async function criarUsuario(db: DbOuTx, dados: DadosNovoUsuario): Promise<UsuarioSessao> {
  const resultado = esquemaNovoUsuario.safeParse(dados);
  if (!resultado.success) {
    throw new ErroDadosUsuario(resultado.error.issues.map((i) => i.message).join('; '));
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
