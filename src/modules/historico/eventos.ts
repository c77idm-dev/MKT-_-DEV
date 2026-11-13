import { and, asc, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { eventosHistorico, usuarios } from '@/db/schema';
import { ROTULOS_ACABAMENTO } from './rotulos/acabamento';
import { ROTULOS_BASE } from './rotulos/base';
import { ROTULOS_CONFERENCIA } from './rotulos/conferencia';
import { ROTULOS_FISCAL } from './rotulos/fiscal';
import { ROTULOS_LOTES } from './rotulos/lotes';
import { ROTULOS_MERCADO_LIVRE } from './rotulos/mercado-livre';

/** Contrato §4.7. Evidência registra evento na devolução (dados: evidenciaId, tipo, itemId e os hashes). */
export type EntidadeHistorico =
  | 'devolucao'
  | 'item'
  | 'usuario'
  | 'configuracao'
  | 'conta_marketplace'
  | 'contestacao'
  | 'nota_fiscal'
  | 'lote';

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

/** Junção dos rótulos de cada fase (contrato §3: cada fase só edita o próprio arquivo em rotulos/). */
export const ROTULO_ACAO: Record<string, string> = {
  ...ROTULOS_BASE,
  ...ROTULOS_CONFERENCIA,
  ...ROTULOS_MERCADO_LIVRE,
  ...ROTULOS_FISCAL,
  ...ROTULOS_LOTES,
  ...ROTULOS_ACABAMENTO,
};

export function rotuloDaAcao(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao;
}
