import { sql } from 'drizzle-orm';
import { bigint, check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { SITUACOES_PROCESSAMENTO, TIPOS_EVIDENCIA } from '../../modules/midia/dominio';
import { usuarios } from './auth';
import { devolucoes, itensDevolucao } from './devolucoes';

export const tipoEvidenciaEnum = pgEnum('tipo_evidencia', TIPOS_EVIDENCIA);
export const situacaoProcessamentoEnum = pgEnum('situacao_processamento', SITUACOES_PROCESSAMENTO);

/** Spec §5.1 (Evidencia) e §9. Uma linha por foto ou vídeo; o arquivo final fica no armazenamento (contrato §5.2). */
export const evidencias = pgTable(
  'evidencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    devolucaoId: uuid('devolucao_id')
      .notNull()
      .references(() => devolucoes.id, { onDelete: 'cascade' }),
    /** Obrigatório só nas Fotos 3 e 4 (check). */
    itemId: uuid('item_id').references(() => itensDevolucao.id, { onDelete: 'cascade' }),
    tipo: tipoEvidenciaEnum('tipo').notNull(),
    /** image/jpeg, video/mp4, video/quicktime... */
    tipoConteudo: text('tipo_conteudo').notNull(),
    /** Chave no armazenamento final (vazia até PRONTA). */
    caminho: text('caminho'),
    /** Arquivo do upload em MIDIA_TMP_DIR, até o processamento. */
    caminhoTemporario: text('caminho_temporario'),
    /** 'disco' ou 's3': onde está o `caminho` (a troca de provedor não quebra os links antigos). */
    provedor: text('provedor'),
    tamanhoOriginal: bigint('tamanho_original', { mode: 'number' }).notNull(),
    tamanho: bigint('tamanho', { mode: 'number' }),
    /** Calculado ao terminar o upload (spec §9). */
    sha256Original: text('sha256_original').notNull(),
    sha256Final: text('sha256_final'),
    situacaoProcessamento: situacaoProcessamentoEnum('situacao_processamento').notNull().default('RECEBIDA'),
    erroProcessamento: text('erro_processamento'),
    /** Idempotência do envio pelo celular. */
    idCliente: uuid('id_cliente').notNull().unique(),
    enviadoPor: uuid('enviado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    enviadoEm: timestamp('enviado_em', { withTimezone: true }).notNull().defaultNow(),
    processadoEm: timestamp('processado_em', { withTimezone: true }),
  },
  (t) => [
    index('evidencias_devolucao_idx').on(t.devolucaoId),
    uniqueIndex('evidencias_pacote_tipo_uq').on(t.devolucaoId, t.tipo).where(sql`"item_id" is null and "tipo" <> 'EXTRA'`),
    uniqueIndex('evidencias_item_tipo_uq').on(t.itemId, t.tipo).where(sql`"item_id" is not null`),
    check('evidencias_item_obrigatorio', sql`"tipo" not in ('FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL') or "item_id" is not null`),
  ],
);
