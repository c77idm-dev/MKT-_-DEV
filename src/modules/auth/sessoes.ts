import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { sessoes, usuarios } from '@/db/schema';
import type { UsuarioSessao } from './usuarios';

/** 12 horas: cobre um turno de trabalho. */
export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000;

export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

export function idDaSessao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function criarSessao(
  db: Db,
  usuarioId: string,
  agora: Date = new Date(),
): Promise<{ token: string; expiraEm: Date }> {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);
  await db.insert(sessoes).values({ id: idDaSessao(token), usuarioId, expiraEm });
  return { token, expiraEm };
}

export async function validarSessao(db: Db, token: string, agora: Date = new Date()): Promise<UsuarioSessao | null> {
  if (!token) return null;
  const id = idDaSessao(token);
  const [linha] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      perfil: usuarios.perfil,
      ativo: usuarios.ativo,
      expiraEm: sessoes.expiraEm,
    })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(eq(sessoes.id, id))
    .limit(1);

  if (!linha) return null;
  if (linha.expiraEm.getTime() <= agora.getTime() || !linha.ativo) {
    await db.delete(sessoes).where(eq(sessoes.id, id));
    return null;
  }
  return { id: linha.id, nome: linha.nome, email: linha.email, perfil: linha.perfil };
}

export async function encerrarSessao(db: Db, token: string): Promise<void> {
  await db.delete(sessoes).where(eq(sessoes.id, idDaSessao(token)));
}
