import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_RETIRADA } from '../../modules/retiradas/dominio';
import { usuarios } from './auth';
import { produtos } from './catalogo';

export const situacaoRetiradaEnum = pgEnum('situacao_retirada_full', SITUACOES_RETIRADA);

/**
 * Melhoria 3: retirada do Full (mercadoria da empresa voltando do armazém do ML). Registro próprio, fora das devoluções:
 * não entra nas etapas, na Busca Avançada, na NF, no ML, nos lotes nem nos alertas.
 */
export const retiradasFull = pgTable(
  'retiradas_full',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: bigserial('numero', { mode: 'number' }).notNull().unique(),
    /** RF-000001, gerado pelo banco a partir de `numero` (como o DEV e o LOT). */
    codigo: text('codigo')
      .notNull()
      .unique()
      .generatedAlwaysAs(sql`'RF-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end`),
    codigoEtiqueta: text('codigo_etiqueta').notNull(),
    situacao: situacaoRetiradaEnum('situacao').notNull().default('ABERTA'),
    recebidaPor: uuid('recebida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    recebidaEm: timestamp('recebida_em', { withTimezone: true }).notNull(),
    /** Entrada de estoque (ponte com a melhoria 4): a data em que a retirada ficou Conferida. */
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    /** (extra, emenda E29) Apagar esconde, não exclui (`retiradaVisivel`); o Gestor restaura pela lista Apagadas. */
    apagadaEm: timestamp('apagada_em', { withTimezone: true }),
    apagadaPor: uuid('apagada_por').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('retiradas_full_etiqueta_idx').on(t.codigoEtiqueta),
    check('retiradas_full_concluida', sql`("situacao" = 'CONFERIDA') = ("concluida_em" is not null)`),
  ],
);

/** Um produto (ou um EAN fora do cadastro) e a quantidade que chegou. */
export const itensRetiradaFull = pgTable(
  'itens_retirada_full',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    retiradaId: uuid('retirada_id')
      .notNull()
      .references(() => retiradasFull.id, { onDelete: 'cascade' }),
    /** Vazio no item "sem cadastro" (então a descrição é obrigatória). */
    produtoId: uuid('produto_id').references(() => produtos.id, { onDelete: 'restrict' }),
    eanLido: text('ean_lido'),
    descricao: text('descricao'),
    quantidade: integer('quantidade').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('itens_retirada_full_retirada_idx').on(t.retiradaId),
    uniqueIndex('itens_retirada_full_produto_uq').on(t.retiradaId, t.produtoId).where(sql`"produto_id" is not null`),
    uniqueIndex('itens_retirada_full_ean_uq').on(t.retiradaId, t.eanLido).where(sql`"produto_id" is null`),
    check('itens_retirada_full_quantidade', sql`"quantidade" > 0`),
    check('itens_retirada_full_descricao', sql`"produto_id" is not null or ("descricao" is not null and length(trim("descricao")) > 0)`),
  ],
);
