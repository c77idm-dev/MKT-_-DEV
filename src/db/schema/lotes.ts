import { sql } from 'drizzle-orm';
import { bigserial, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { STATUS_LOTE, TIPOS_LOTE } from '../../modules/lotes/dominio';
import { usuarios } from './auth';
import { fornecedores } from './catalogo';
import { notasFiscais } from './fiscal';

export const tipoLoteEnum = pgEnum('tipo_lote', TIPOS_LOTE);
export const statusLoteEnum = pgEnum('status_lote', STATUS_LOTE);
const COM_FUSO = { withTimezone: true } as const;

/** Spec §5.1 (Lote) e contrato §4.4. */
export const lotes = pgTable(
  'lotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: bigserial('numero', { mode: 'number' }).notNull().unique(),
    /** LOT-000045, gerado pelo banco a partir de `numero` (como o DEV). */
    codigo: text('codigo')
      .notNull()
      .unique()
      .generatedAlwaysAs(sql`'LOT-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end`),
    fornecedorId: uuid('fornecedor_id').notNull().references(() => fornecedores.id, { onDelete: 'restrict' }),
    /** Definido ao fechar. */
    tipo: tipoLoteEnum('tipo'),
    status: statusLoteEnum('status').notNull().default('ABERTO'),
    rastreioEnvio: text('rastreio_envio'),
    notaFiscalId: uuid('nota_fiscal_id').references((): AnyPgColumn => notasFiscais.id, { onDelete: 'set null' }),
    criadoEm: timestamp('criado_em', COM_FUSO).notNull().defaultNow(),
    fechadoEm: timestamp('fechado_em', COM_FUSO),
    fechadoPor: uuid('fechado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    enviadoEm: timestamp('enviado_em', COM_FUSO),
    finalizadoEm: timestamp('finalizado_em', COM_FUSO),
    atualizadoEm: timestamp('atualizado_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lotes_fornecedor_aberto_uq').on(t.fornecedorId).where(sql`"status" = 'ABERTO'`),
    index('lotes_status_idx').on(t.status),
  ],
);
