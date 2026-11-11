import { bigserial, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Aviso bruto recebido de um marketplace. O processamento (buscar o recurso de novo na API) é da Fase 3. */
export const notificacoesRecebidas = pgTable('notificacoes_recebidas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  canal: text('canal').notNull(),
  topico: text('topico'),
  recurso: text('recurso'),
  payload: jsonb('payload').notNull(),
  recebidaEm: timestamp('recebida_em', { withTimezone: true }).notNull().defaultNow(),
  processadaEm: timestamp('processada_em', { withTimezone: true }),
});
