import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Destinatario } from '../../conectores/nfe/tipos';
import { OPERACOES_FISCAIS, ORIGENS_NOTA_VENDA, SITUACOES_NOTA, TIPOS_NOTA, type ItemNotaVenda } from '../../modules/fiscal/dominio';
import { usuarios } from './auth';
import { ambienteNfeEnum } from './configuracoes';
import { devolucoes } from './devolucoes';

export const tipoNotaEnum = pgEnum('tipo_nota', TIPOS_NOTA);
export const situacaoNotaEnum = pgEnum('situacao_nota', SITUACOES_NOTA);
export const operacaoFiscalEnum = pgEnum('operacao_fiscal', OPERACOES_FISCAIS);
export const origemNotaVendaEnum = pgEnum('origem_nota_venda', ORIGENS_NOTA_VENDA);

const COM_FUSO = { withTimezone: true } as const;

/** Spec §5.1 (NotaFiscal) e contrato §4.3. A FK de `lote_id` para `lotes` entra na Fase 5. */
export const notasFiscais = pgTable(
  'notas_fiscais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoNotaEnum('tipo').notNull(),
    devolucaoId: uuid('devolucao_id').references(() => devolucoes.id),
    loteId: uuid('lote_id'),
    ambiente: ambienteNfeEnum('ambiente').notNull(),
    serie: text('serie'),
    numero: text('numero'),
    chave: text('chave').unique(),
    chavesReferenciadas: text('chaves_referenciadas').array().notNull().default(sql`'{}'::text[]`),
    situacao: situacaoNotaEnum('situacao').notNull().default('PROCESSANDO'),
    motivoRejeicao: text('motivo_rejeicao'),
    /** O `ref` da Focus = id sem hífens (só letras e números). */
    referenciaEmissor: text('referencia_emissor').notNull().unique(),
    xmlCaminho: text('xml_caminho'),
    danfeCaminho: text('danfe_caminho'),
    xmlCancelamentoCaminho: text('xml_cancelamento_caminho'),
    justificativaCancelamento: text('justificativa_cancelamento'),
    emitidaPor: uuid('emitida_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', COM_FUSO).notNull().defaultNow(),
    autorizadaEm: timestamp('autorizada_em', COM_FUSO),
    canceladaEm: timestamp('cancelada_em', COM_FUSO),
    atualizadaEm: timestamp('atualizada_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [
    check('notas_fiscais_um_alvo', sql`num_nonnulls("devolucao_id", "lote_id") = 1`),
    // "Uma NF por devolução" (spec §6.4): outra só depois de cancelar a anterior.
    uniqueIndex('notas_fiscais_devolucao_ativa_uq').on(t.devolucaoId).where(sql`"situacao" <> 'CANCELADA'`),
    uniqueIndex('notas_fiscais_lote_ativa_uq').on(t.loteId).where(sql`"situacao" <> 'CANCELADA'`),
    index('notas_fiscais_autorizada_em_idx').on(t.autorizadaEm),
    index('notas_fiscais_cancelada_em_idx').on(t.canceladaEm),
  ],
);

/** XML da NF de venda (spec §7.5). O destinatário guarda só o necessário à NF (LGPD). */
export const notasVenda = pgTable(
  'notas_venda',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    chave: text('chave').notNull(),
    origem: origemNotaVendaEnum('origem').notNull(),
    xmlCaminho: text('xml_caminho').notNull(),
    destinatario: jsonb('destinatario').$type<Destinatario>().notNull(),
    itens: jsonb('itens').$type<ItemNotaVenda[]>().notNull(),
    emitidaEm: timestamp('emitida_em', COM_FUSO),
    anexadaPor: uuid('anexada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    criadaEm: timestamp('criada_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notas_venda_devolucao_chave_uq').on(t.devolucaoId, t.chave)],
);

/** Spec §5.1 (RegraFiscal) e §8.2. Nenhuma nasce gravada (D13). */
export const regrasFiscais = pgTable(
  'regras_fiscais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipoNota: tipoNotaEnum('tipo_nota').notNull(),
    operacao: operacaoFiscalEnum('operacao').notNull(),
    cfop: text('cfop').notNull(),
    /** CSOSN no Simples; CST no Presumido e no Real. */
    icmsSituacaoTributaria: text('icms_situacao_tributaria').notNull(),
    pisSituacaoTributaria: text('pis_situacao_tributaria').notNull(),
    cofinsSituacaoTributaria: text('cofins_situacao_tributaria').notNull(),
    naturezaOperacao: text('natureza_operacao').notNull(),
    informacoesComplementares: text('informacoes_complementares'),
    atualizadoPor: uuid('atualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadoEm: timestamp('atualizado_em', COM_FUSO).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('regras_fiscais_tipo_operacao_uq').on(t.tipoNota, t.operacao)],
);
