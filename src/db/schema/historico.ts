import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { usuarios } from './auth';

/** Spec §5.1 (EventoHistorico): quem fez o quê e quando. Toda mudança de status grava uma linha (spec §5.2). */
export const eventosHistorico = pgTable(
  'eventos_historico',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id').notNull(),
    acao: text('acao').notNull(),
    de: text('de'),
    para: text('para'),
    /** Vazio quando a ação é do sistema. */
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
    dados: jsonb('dados').$type<Record<string, unknown>>(),
  },
  (t) => [index('eventos_historico_entidade_idx').on(t.entidade, t.entidadeId)],
);
