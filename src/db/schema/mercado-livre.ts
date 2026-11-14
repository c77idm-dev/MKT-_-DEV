import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_CONTA, STATUS_CONTESTACAO } from '../../modules/mercado-livre/dominio';
import { usuarios } from './auth';
import { canalEnum, devolucoes } from './devolucoes';

export const situacaoContaEnum = pgEnum('situacao_conta', SITUACOES_CONTA);
export const statusContestacaoEnum = pgEnum('status_contestacao', STATUS_CONTESTACAO);

/** Spec §5.1 (ContaMarketplace). Os tokens ficam cifrados com AES-256-GCM (CHAVE_CRIPTOGRAFIA, spec §10). */
export const contasMarketplace = pgTable(
  'contas_marketplace',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    canal: canalEnum('canal').notNull(),
    sellerId: text('seller_id').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    situacao: situacaoContaEnum('situacao').notNull().default('ATIVA'),
    escopo: text('escopo'),
    /** Última varredura bem-sucedida: alerta "sincronização parada há mais de 1h" (spec §11). */
    ultimaSincronizacaoEm: timestamp('ultima_sincronizacao_em', { withTimezone: true }),
    conectadaPor: uuid('conectada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    conectadaEm: timestamp('conectada_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('contas_marketplace_canal_seller_uq').on(t.canal, t.sellerId)],
);

/** Spec §5.1 (ContestacaoCanal): uma por devolução (D8). `evidencias` = ids das fotos (o vídeo não vai ao ML). */
export const contestacoesCanal = pgTable(
  'contestacoes_canal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .unique()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    motivoCanal: text('motivo_canal').notNull(),
    mensagem: text('mensagem').notNull(),
    evidencias: uuid('evidencias').array().notNull().default(sql`'{}'::uuid[]`),
    prazo: timestamp('prazo', { withTimezone: true }),
    status: statusContestacaoEnum('status').notNull().default('AGUARDANDO_GESTOR'),
    /** Gestor que pediu o envio. AGUARDANDO_GESTOR com revisor = envio pedido, esperando a tarefa. */
    revisadoPor: uuid('revisado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    erro: text('erro'),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    enviadaEm: timestamp('enviada_em', { withTimezone: true }),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contestacoes_canal_status_prazo_idx').on(t.status, t.prazo),
    check('contestacoes_canal_motivo', sql`"motivo_canal" in ('SRF2', 'SRF3', 'SRF4', 'SRF5', 'SRF6')`),
  ],
);

/** Estado da sincronização de cada reclamação do ML (o "mapeamento" da spec §14). `low_cost` fica sem devolução (D10). */
export const reclamacoesMl = pgTable(
  'reclamacoes_ml',
  {
    claimId: text('claim_id').primaryKey(),
    returnId: text('return_id'),
    subtipo: text('subtipo'),
    statusReclamacao: text('status_reclamacao'),
    statusDevolucao: text('status_devolucao'),
    devolucaoId: uuid('devolucao_id').references(() => devolucoes.id, { onDelete: 'set null' }),
    atualizadaNoMlEm: timestamp('atualizada_no_ml_em', { withTimezone: true }),
    sincronizadaEm: timestamp('sincronizada_em', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('reclamacoes_ml_devolucao_idx').on(t.devolucaoId),
    index('reclamacoes_ml_return_idx').on(t.returnId),
    index('reclamacoes_ml_subtipo_idx').on(t.subtipo),
  ],
);
