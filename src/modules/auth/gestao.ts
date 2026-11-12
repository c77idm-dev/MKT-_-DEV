import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { sessoes, usuarios } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { registrarEvento } from '@/modules/historico/eventos';
import { ehPerfil, type Perfil } from './perfis';
import { pode } from './permissoes';
import { criarUsuario, type DadosNovoUsuario, type UsuarioSessao } from './usuarios';

export class ErroGestaoUsuario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroGestaoUsuario';
  }
}

export type UsuarioLista = { id: string; nome: string; email: string; perfil: Perfil; ativo: boolean };

const MSG_ULTIMO_GESTOR = 'O sistema precisa de pelo menos um Gestor ativo.';

function exigirGestor(ator: UsuarioSessao) {
  if (!pode(ator.perfil, 'administrar')) throw new ErroGestaoUsuario('Só o Gestor gerencia usuários.');
}

function exigirOutroUsuario(alvoId: string, ator: UsuarioSessao, mensagem: string) {
  if (alvoId === ator.id) throw new ErroGestaoUsuario(mensagem);
  if (!ehUuid(alvoId)) throw new ErroGestaoUsuario('Usuário não encontrado.');
}

/**
 * Dentro da transação: trava os Gestores ativos e confere que, tirando o alvo, ainda sobra um.
 * A trava (FOR UPDATE) evita que dois Gestores se rebaixem ao mesmo tempo e deixem o sistema sem nenhum.
 */
async function exigirOutroGestorAtivo(tx: DbOuTx, alvoId: string) {
  const outros = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.perfil, 'GESTOR'), eq(usuarios.ativo, true), ne(usuarios.id, alvoId)))
    .for('update');
  if (outros.length === 0) throw new ErroGestaoUsuario(MSG_ULTIMO_GESTOR);
}

export async function listarUsuarios(db: DbOuTx): Promise<UsuarioLista[]> {
  return db
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, perfil: usuarios.perfil, ativo: usuarios.ativo })
    .from(usuarios)
    .orderBy(desc(usuarios.ativo), asc(usuarios.nome));
}

export async function criarUsuarioPeloGestor(db: DbOuTx, dados: DadosNovoUsuario, ator: UsuarioSessao): Promise<UsuarioSessao> {
  exigirGestor(ator);
  const novo = await criarUsuario(db, dados);
  await registrarEvento(db, { entidade: 'usuario', entidadeId: novo.id, acao: 'usuario_criado', para: novo.perfil, usuarioId: ator.id });
  return novo;
}

/** A sessão aberta já passa a valer com o perfil novo: o perfil é lido do banco a cada página. */
export async function alterarPerfil(db: DbOuTx, alvoId: string, perfil: string, ator: UsuarioSessao): Promise<void> {
  exigirGestor(ator);
  exigirOutroUsuario(alvoId, ator, 'Você não pode mudar o próprio perfil.');
  if (!ehPerfil(perfil)) throw new ErroGestaoUsuario('Perfil inválido.');
  await db.transaction(async (tx) => {
    const [antes] = await tx.select({ perfil: usuarios.perfil, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, alvoId)).for('update');
    if (!antes) throw new ErroGestaoUsuario('Usuário não encontrado.');
    if (antes.perfil === perfil) return;
    if (antes.perfil === 'GESTOR' && antes.ativo) await exigirOutroGestorAtivo(tx, alvoId);
    await tx.update(usuarios).set({ perfil }).where(eq(usuarios.id, alvoId));
    await registrarEvento(tx, { entidade: 'usuario', entidadeId: alvoId, acao: 'perfil_alterado', de: antes.perfil, para: perfil, usuarioId: ator.id });
  });
}

/** Spec §6.8: desativar encerra as sessões do usuário na hora. Reativar também zera o bloqueio por senha errada. */
export async function definirAtivo(db: DbOuTx, alvoId: string, ativo: boolean, ator: UsuarioSessao): Promise<void> {
  exigirGestor(ator);
  exigirOutroUsuario(alvoId, ator, 'Você não pode desativar o próprio usuário.');
  await db.transaction(async (tx) => {
    const [antes] = await tx.select({ perfil: usuarios.perfil, ativo: usuarios.ativo }).from(usuarios).where(eq(usuarios.id, alvoId)).for('update');
    if (!antes) throw new ErroGestaoUsuario('Usuário não encontrado.');
    if (!ativo && antes.perfil === 'GESTOR' && antes.ativo) await exigirOutroGestorAtivo(tx, alvoId);
    await tx
      .update(usuarios)
      .set(ativo ? { ativo: true, falhasLogin: 0, bloqueadoAte: null } : { ativo: false })
      .where(eq(usuarios.id, alvoId));
    if (!ativo) await tx.delete(sessoes).where(eq(sessoes.usuarioId, alvoId));
    await registrarEvento(tx, {
      entidade: 'usuario',
      entidadeId: alvoId,
      acao: ativo ? 'usuario_reativado' : 'usuario_desativado',
      usuarioId: ator.id,
    });
  });
}
