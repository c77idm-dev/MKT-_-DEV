import { sql } from 'drizzle-orm';
import { check, integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { AMBIENTES_NFE, REGIMES_TRIBUTARIOS, VIDEO_OBRIGATORIO } from '../../modules/configuracoes/dominio';
import { usuarios } from './auth';

export const videoObrigatorioEnum = pgEnum('video_obrigatorio', VIDEO_OBRIGATORIO);
export const regimeTributarioEnum = pgEnum('regime_tributario', REGIMES_TRIBUTARIOS);
export const ambienteNfeEnum = pgEnum('ambiente_nfe', AMBIENTES_NFE);

/**
 * Spec §5.1 (Configuracao): uma linha só (id = 1). Cada fase grava só os seus campos, com upsert
 * (Fase 2: vídeo e prazo de guarda; Fase 4: empresa, regime, série e ambiente). O provedor de armazenamento
 * não é coluna: vem de ARMAZENAMENTO no .env (contrato §4.1 e D2).
 */
export const configuracoes = pgTable(
  'configuracoes',
  {
    id: smallint('id').primaryKey().default(1),
    razaoSocial: text('razao_social'),
    cnpj: text('cnpj'),
    ie: text('ie'),
    logradouro: text('logradouro'),
    numero: text('numero'),
    complemento: text('complemento'),
    bairro: text('bairro'),
    cidade: text('cidade'),
    uf: text('uf'),
    cep: text('cep'),
    /** Vazio até o Gestor escolher. */
    regimeTributario: regimeTributarioEnum('regime_tributario'),
    /** Ex.: '2'. */
    serieNfe: text('serie_nfe'),
    ambienteNfe: ambienteNfeEnum('ambiente_nfe').notNull().default('HOMOLOGACAO'),
    videoObrigatorio: videoObrigatorioEnum('video_obrigatorio').notNull().default('SEMPRE'),
    mesesRetencaoMidia: integer('meses_retencao_midia').notNull().default(12),
    atualizadoPor: uuid('atualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }),
  },
  () => [check('configuracoes_linha_unica', sql`"id" = 1`)],
);
