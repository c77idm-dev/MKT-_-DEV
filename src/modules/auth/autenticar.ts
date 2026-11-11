import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { usuarios } from '@/db/schema';
import { gerarHashSenha, verificarSenha } from './senha';
import type { UsuarioSessao } from './usuarios';

export const MAX_FALHAS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

export type ResultadoLogin =
  | { ok: true; usuario: UsuarioSessao }
  | { ok: false; motivo: 'credenciais' | 'bloqueado' };

let hashFicticio: Promise<string> | undefined;
/** Usado quando o e-mail não existe, para a resposta levar o mesmo tempo e não revelar quais e-mails estão cadastrados. */
function obterHashFicticio(): Promise<string> {
  hashFicticio ??= gerarHashSenha('senha-ficticia-so-para-tempo');
  return hashFicticio;
}

export async function autenticar(
  db: Db,
  email: string,
  senha: string,
  agora: Date = new Date(),
): Promise<ResultadoLogin> {
  const emailNormalizado = email.trim().toLowerCase();
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, emailNormalizado)).limit(1);

  if (!u || !u.ativo) {
    await verificarSenha(await obterHashFicticio(), senha);
    return { ok: false, motivo: 'credenciais' };
  }

  if (u.bloqueadoAte && u.bloqueadoAte.getTime() > agora.getTime()) {
    return { ok: false, motivo: 'bloqueado' };
  }

  if (!(await verificarSenha(u.senhaHash, senha))) {
    const [atualizado] = await db
      .update(usuarios)
      .set({ falhasLogin: sql`${usuarios.falhasLogin} + 1` })
      .where(eq(usuarios.id, u.id))
      .returning({ falhas: usuarios.falhasLogin });

    if (atualizado.falhas >= MAX_FALHAS) {
      await db
        .update(usuarios)
        .set({ falhasLogin: 0, bloqueadoAte: new Date(agora.getTime() + BLOQUEIO_MS) })
        .where(eq(usuarios.id, u.id));
      return { ok: false, motivo: 'bloqueado' };
    }
    return { ok: false, motivo: 'credenciais' };
  }

  if (u.falhasLogin !== 0 || u.bloqueadoAte !== null) {
    await db.update(usuarios).set({ falhasLogin: 0, bloqueadoAte: null }).where(eq(usuarios.id, u.id));
  }
  return { ok: true, usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil } };
}
