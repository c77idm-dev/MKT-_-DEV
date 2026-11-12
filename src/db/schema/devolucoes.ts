import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { CANAIS, ORIGENS, STATUS_DEVOLUCAO, STATUS_ITEM, TIPOS_DEVOLUCAO } from '../../modules/devolucoes/dominio';
import { usuarios } from './auth';
import { produtos } from './catalogo';

export const canalEnum = pgEnum('canal', CANAIS);
export const origemDevolucaoEnum = pgEnum('origem_devolucao', ORIGENS);
export const tipoDevolucaoEnum = pgEnum('tipo_devolucao', TIPOS_DEVOLUCAO);
export const statusDevolucaoEnum = pgEnum('status_devolucao', STATUS_DEVOLUCAO);
export const statusItemEnum = pgEnum('status_item', STATUS_ITEM);

/** Spec §5.1 (Devolucao): o pacote. A trava e as datas da conferência entram na Fase 2. */
export const devolucoes = pgTable(
  'devolucoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: bigserial('numero', { mode: 'number' }).notNull().unique(),
    /** DEV-000123, gerado pelo banco a partir de `numero`. */
    codigo: text('codigo')
      .notNull()
      .unique()
      .generatedAlwaysAs(sql`'DEV-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end`),
    /** Vazio só no pacote não identificado (regra no banco: devolucoes_canal_obrigatorio). */
    canal: canalEnum('canal'),
    origem: origemDevolucaoEnum('origem').notNull(),
    pedidosExternos: text('pedidos_externos').array().notNull().default(sql`'{}'::text[]`),
    reclamacaoId: text('reclamacao_id'),
    devolucaoExternaId: text('devolucao_externa_id'),
    tipo: tipoDevolucaoEnum('tipo').notNull().default('DEVOLUCAO'),
    rastreio: text('rastreio'),
    transportadora: text('transportadora'),
    status: statusDevolucaoEnum('status').notNull(),
    statusCanal: text('status_canal'),
    entregueSegundoCanalEm: timestamp('entregue_segundo_canal_em', { withTimezone: true }),
    prazoConferenciaCanal: timestamp('prazo_conferencia_canal', { withTimezone: true }),
    naoIdentificada: boolean('nao_identificada').notNull().default(false),
    motivoCliente: text('motivo_cliente'),
    postadaEm: date('postada_em', { mode: 'string' }),
    observacoes: text('observacoes'),
    criadoPor: uuid('criado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    recebidaEm: timestamp('recebida_em', { withTimezone: true }),
    recebidaPor: uuid('recebida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadaEm: timestamp('atualizada_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('devolucoes_canal_externa_uq').on(t.canal, t.devolucaoExternaId),
    index('devolucoes_status_idx').on(t.status),
    index('devolucoes_rastreio_idx').on(t.rastreio),
    check('devolucoes_canal_obrigatorio', sql`"canal" is not null or "nao_identificada"`),
  ],
);

/** Spec §5.1 (ItemDevolucao): uma linha por unidade física. O resto dos campos da conferência entra na Fase 2. */
export const itensDevolucao = pgTable(
  'itens_devolucao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    /** 1, 2, 3... dentro da devolução. */
    unidade: integer('unidade').notNull(),
    sku: text('sku').notNull(),
    produtoEsperadoId: uuid('produto_esperado_id').references(() => produtos.id, { onDelete: 'set null' }),
    /** Preenchido na conferência (Fase 2); já existe para o filtro "Serial Number" da Busca Avançada. */
    serial: text('serial'),
    status: statusItemEnum('status').notNull().default('PENDENTE'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('itens_devolucao_devolucao_idx').on(t.devolucaoId),
    uniqueIndex('itens_devolucao_unidade_uq').on(t.devolucaoId, t.unidade),
  ],
);
