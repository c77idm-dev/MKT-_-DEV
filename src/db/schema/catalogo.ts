import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Spec §5.1 (Fornecedor). CNPJ sem pontuação, numérico ou alfanumérico. */
export const fornecedores = pgTable('fornecedores', {
  id: uuid('id').primaryKey().defaultRandom(),
  razaoSocial: text('razao_social').notNull(),
  cnpj: text('cnpj').notNull().unique(),
  ie: text('ie'),
  logradouro: text('logradouro'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  uf: text('uf'),
  cep: text('cep'),
  contatoSac: text('contato_sac'),
  emailSac: text('email_sac'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Spec §5.1 (Produto). SKU único, em maiúsculas. */
export const produtos = pgTable(
  'produtos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: text('sku').notNull().unique(),
    ean: text('ean'),
    descricao: text('descricao').notNull(),
    fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id, { onDelete: 'set null' }),
    ncm: text('ncm'),
    custo: numeric('custo', { precision: 12, scale: 2 }),
    unidade: text('unidade'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('produtos_ean_idx').on(t.ean), index('produtos_fornecedor_idx').on(t.fornecedorId)],
);
