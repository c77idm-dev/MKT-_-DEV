import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_BACKUP, SITUACOES_FALHA } from '../../modules/acabamento/dominio';
import { usuarios } from './auth';

export const situacaoFalhaEnum = pgEnum('situacao_falha', SITUACOES_FALHA);
export const situacaoBackupEnum = pgEnum('situacao_backup', SITUACOES_BACKUP);

/** Spec §6.8 e §11: tarefas que esgotaram as 5 tentativas (vêm da fila "falhas" do pg-boss; decisão 1). */
export const falhasTarefas = pgTable(
  'falhas_tarefas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tarefa: text('tarefa').notNull(),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull(),
    /** sha256 de tarefa + dados (decisão 2). */
    assinatura: text('assinatura').notNull(),
    erro: text('erro').notNull(),
    tentativas: integer('tentativas').notNull(),
    ocorrencias: integer('ocorrencias').notNull().default(1),
    ultimoJobId: uuid('ultimo_job_id').notNull(),
    primeiraFalhaEm: timestamp('primeira_falha_em', { withTimezone: true }).notNull(),
    ultimaFalhaEm: timestamp('ultima_falha_em', { withTimezone: true }).notNull(),
    situacao: situacaoFalhaEnum('situacao').notNull().default('ABERTA'),
    resolvidaPor: uuid('resolvida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    resolvidaEm: timestamp('resolvida_em', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('falhas_tarefas_aberta_unica').on(t.assinatura).where(sql`"situacao" = 'ABERTA'`),
    index('falhas_tarefas_situacao_idx').on(t.situacao, t.ultimaFalhaEm),
  ],
);

/** Spec §10: cada execução do backup diário (o script docker/backup/backup.sh grava pelo psql). */
export const execucoesBackup = pgTable('execucoes_backup', {
  id: uuid('id').primaryKey().defaultRandom(),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).notNull().defaultNow(),
  terminadoEm: timestamp('terminado_em', { withTimezone: true }),
  situacao: situacaoBackupEnum('situacao').notNull().default('EM_ANDAMENTO'),
  arquivoBanco: text('arquivo_banco'),
  tamanhoBanco: bigint('tamanho_banco', { mode: 'number' }),
  arquivoMidia: text('arquivo_midia'),
  tamanhoMidia: bigint('tamanho_midia', { mode: 'number' }),
  erro: text('erro'),
});
