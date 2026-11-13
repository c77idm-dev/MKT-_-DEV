import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Aviso bruto recebido de um marketplace. É só um gatilho: a sincronização busca o recurso de novo na API (spec §7.2). */
export const notificacoesRecebidas = pgTable(
  'notificacoes_recebidas',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    canal: text('canal').notNull(),
    topico: text('topico'),
    recurso: text('recurso'),
    /** Id do recurso no canal (no ML, o claim_id): a sincronização marca como processados os avisos dele. */
    referenciaExterna: text('referencia_externa'),
    payload: jsonb('payload').notNull(),
    recebidaEm: timestamp('recebida_em', { withTimezone: true }).notNull().defaultNow(),
    processadaEm: timestamp('processada_em', { withTimezone: true }),
  },
  (t) => [index('notificacoes_recebidas_referencia_idx').on(t.canal, t.referenciaExterna)],
);
