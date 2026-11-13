CREATE TYPE "public"."ambiente_nfe" AS ENUM('HOMOLOGACAO', 'PRODUCAO');--> statement-breakpoint
CREATE TYPE "public"."regime_tributario" AS ENUM('SIMPLES', 'PRESUMIDO', 'REAL');--> statement-breakpoint
CREATE TYPE "public"."video_obrigatorio" AS ENUM('SEMPRE', 'SO_PROBLEMA');--> statement-breakpoint
CREATE TYPE "public"."destino_item" AS ENUM('BOM', 'PROBLEMA');--> statement-breakpoint
CREATE TYPE "public"."motivo_item" AS ENUM('AVARIADO', 'USADO', 'DIVERGENTE', 'INCOMPLETO', 'COM_DEFEITO', 'AUSENTE', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."situacao_processamento" AS ENUM('RECEBIDA', 'PROCESSANDO', 'PRONTA', 'FALHOU', 'APAGADA');--> statement-breakpoint
CREATE TYPE "public"."tipo_evidencia" AS ENUM('FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM', 'FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL', 'VIDEO_PROVA', 'EXTRA');--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"razao_social" text,
	"cnpj" text,
	"ie" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"cep" text,
	"regime_tributario" "regime_tributario",
	"serie_nfe" text,
	"ambiente_nfe" "ambiente_nfe" DEFAULT 'HOMOLOGACAO' NOT NULL,
	"video_obrigatorio" "video_obrigatorio" DEFAULT 'SEMPRE' NOT NULL,
	"meses_retencao_midia" integer DEFAULT 12 NOT NULL,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone,
	CONSTRAINT "configuracoes_linha_unica" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "evidencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"devolucao_id" uuid NOT NULL,
	"item_id" uuid,
	"tipo" "tipo_evidencia" NOT NULL,
	"tipo_conteudo" text NOT NULL,
	"caminho" text,
	"caminho_temporario" text,
	"provedor" text,
	"tamanho_original" bigint NOT NULL,
	"tamanho" bigint,
	"sha256_original" text NOT NULL,
	"sha256_final" text,
	"situacao_processamento" "situacao_processamento" DEFAULT 'RECEBIDA' NOT NULL,
	"erro_processamento" text,
	"id_cliente" uuid NOT NULL,
	"enviado_por" uuid,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	CONSTRAINT "evidencias_id_cliente_unique" UNIQUE("id_cliente"),
	CONSTRAINT "evidencias_item_obrigatorio" CHECK ("tipo" not in ('FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL') or "item_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "devolucoes" ADD COLUMN "conferente_id" uuid;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD COLUMN "conferencia_iniciada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD COLUMN "conferida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD COLUMN "concluida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "produto_recebido_id" uuid;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "ean_lido" text;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "lote_fabricacao" text;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "validade" text;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "destino" "destino_item";--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "motivo" "motivo_item";--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_devolucao_id_devolucoes_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_item_id_itens_devolucao_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."itens_devolucao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_enviado_por_usuarios_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidencias_devolucao_idx" ON "evidencias" USING btree ("devolucao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidencias_pacote_tipo_uq" ON "evidencias" USING btree ("devolucao_id","tipo") WHERE "item_id" is null and "tipo" <> 'EXTRA';--> statement-breakpoint
CREATE UNIQUE INDEX "evidencias_item_tipo_uq" ON "evidencias" USING btree ("item_id","tipo") WHERE "item_id" is not null;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_conferente_id_usuarios_id_fk" FOREIGN KEY ("conferente_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_devolucao_produto_recebido_id_produtos_id_fk" FOREIGN KEY ("produto_recebido_id") REFERENCES "public"."produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_devolucao_produto_recebido_idx" ON "itens_devolucao" USING btree ("produto_recebido_id");--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_destino_motivo" CHECK (("destino" is not null and "destino" = 'BOM' and "motivo" is null)
        or ("destino" is not null and "destino" = 'PROBLEMA' and "motivo" is not null and "motivo" <> 'AUSENTE')
        or ("destino" is null and ("motivo" is null or "motivo" = 'AUSENTE')));