import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { TIPOS_IMPORTACAO, type Mapeamento, type ResumoImportacao } from '../../modules/importacao/tipos';
import { usuarios } from './auth';

export const tipoImportacaoEnum = pgEnum('tipo_importacao', TIPOS_IMPORTACAO);
export const situacaoImportacaoEnum = pgEnum('situacao_importacao', ['PENDENTE', 'CONCLUIDA']);

/** Planilha enviada, guardada entre o envio e a confirmação (spec §6.8: prévia antes de confirmar). */
export const importacoes = pgTable('importacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tipo: tipoImportacaoEnum('tipo').notNull(),
  nomeArquivo: text('nome_arquivo').notNull(),
  cabecalhos: jsonb('cabecalhos').$type<string[]>().notNull(),
  linhas: jsonb('linhas').$type<string[][]>().notNull(),
  /** Linha real do cabeçalho na planilha (há planilhas com linhas em branco no início). */
  linhaCabecalho: integer('linha_cabecalho').notNull().default(1),
  mapeamento: jsonb('mapeamento').$type<Mapeamento>(),
  situacao: situacaoImportacaoEnum('situacao').notNull().default('PENDENTE'),
  resumo: jsonb('resumo').$type<ResumoImportacao>(),
  criadoPor: uuid('criado_por')
    .notNull()
    .references(() => usuarios.id),
  criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
  concluidaEm: timestamp('concluida_em', { withTimezone: true }),
});

/** Último mapeamento confirmado de cada tipo: vira a sugestão da próxima importação (spec §6.8). */
export const mapeamentosImportacao = pgTable('mapeamentos_importacao', {
  tipo: tipoImportacaoEnum('tipo').primaryKey(),
  mapeamento: jsonb('mapeamento').$type<Mapeamento>().notNull(),
  atualizadoPor: uuid('atualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});
