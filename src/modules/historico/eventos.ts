import { and, asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { eventosHistorico, usuarios } from '@/db/schema';

export type EntidadeHistorico = 'devolucao' | 'usuario';

export type NovoEvento = {
  entidade: EntidadeHistorico;
  entidadeId: string;
  acao: string;
  de?: string | null;
  para?: string | null;
  /** null quando a ação é do sistema. */
  usuarioId: string | null;
  dados?: Record<string, unknown>;
  em?: Date;
};

export async function registrarEvento(db: DbOuTx, e: NovoEvento): Promise<void> {
  await db.insert(eventosHistorico).values({
    entidade: e.entidade,
    entidadeId: e.entidadeId,
    acao: e.acao,
    de: e.de ?? null,
    para: e.para ?? null,
    usuarioId: e.usuarioId,
    dados: e.dados ?? null,
    ...(e.em ? { em: e.em } : {}),
  });
}

export type EventoListado = {
  id: number;
  acao: string;
  de: string | null;
  para: string | null;
  em: Date;
  usuarioNome: string | null;
  dados: Record<string, unknown> | null;
};

export async function listarEventos(db: DbOuTx, entidade: EntidadeHistorico, entidadeId: string): Promise<EventoListado[]> {
  return db
    .select({
      id: eventosHistorico.id,
      acao: eventosHistorico.acao,
      de: eventosHistorico.de,
      para: eventosHistorico.para,
      em: eventosHistorico.em,
      usuarioNome: usuarios.nome,
      dados: eventosHistorico.dados,
    })
    .from(eventosHistorico)
    .leftJoin(usuarios, eq(usuarios.id, eventosHistorico.usuarioId))
    .where(and(eq(eventosHistorico.entidade, entidade), eq(eventosHistorico.entidadeId, entidadeId)))
    // Ordem de gravação: o id cresce a cada evento.
    .orderBy(asc(eventosHistorico.id));
}

export const ROTULO_ACAO: Record<string, string> = {
  criada: 'Devolução cadastrada',
  criada_nao_identificada: 'Pacote não identificado registrado',
  recebida: 'Chegada registrada',
  identificada: 'Devolução identificada',
  cancelada: 'Devolução cancelada',
  extraviada: 'Devolução marcada como extraviada',
  usuario_criado: 'Usuário criado',
  perfil_alterado: 'Perfil alterado',
  usuario_desativado: 'Usuário desativado',
  usuario_reativado: 'Usuário reativado',
};

export function rotuloDaAcao(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao;
}
