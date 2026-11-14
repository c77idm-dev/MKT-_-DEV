CREATE TYPE "public"."operacao_fiscal" AS ENUM('DENTRO_ESTADO', 'FORA_ESTADO');--> statement-breakpoint
CREATE TYPE "public"."origem_nota_venda" AS ENUM('MERCADO_LIVRE', 'ANEXO');--> statement-breakpoint
CREATE TYPE "public"."situacao_nota" AS ENUM('PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."tipo_nota" AS ENUM('DEVOLUCAO_VENDA', 'REMESSA_CONSERTO', 'REMESSA_TROCA_GARANTIA');--> statement-breakpoint
CREATE TABLE "notas_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_nota" NOT NULL,
	"devolucao_id" uuid,
	"lote_id" uuid,
	"ambiente" "ambiente_nfe" NOT NULL,
	"serie" text,
	"numero" text,
	"chave" text,
	"chaves_referenciadas" text[] DEFAULT '{}'::text[] NOT NULL,
	"situacao" "situacao_nota" DEFAULT 'PROCESSANDO' NOT NULL,
	"motivo_rejeicao" text,
	"referencia_emissor" text NOT NULL,
	"xml_caminho" text,
	"danfe_caminho" text,
	"xml_cancelamento_caminho" text,
	"justificativa_cancelamento" text,
	"emitida_por" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"autorizada_em" timestamp with time zone,
	"cancelada_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notas_fiscais_chave_unique" UNIQUE("chave"),
	CONSTRAINT "notas_fiscais_referencia_emissor_unique" UNIQUE("referencia_emissor"),
	CONSTRAINT "notas_fiscais_um_alvo" CHECK (num_nonnulls("devolucao_id", "lote_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "notas_venda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"devolucao_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"origem" "origem_nota_venda" NOT NULL,
	"xml_caminho" text NOT NULL,
	"destinatario" jsonb NOT NULL,
	"itens" jsonb NOT NULL,
	"emitida_em" timestamp with time zone,
	"anexada_por" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_nota" "tipo_nota" NOT NULL,
	"operacao" "operacao_fiscal" NOT NULL,
	"cfop" text NOT NULL,
	"icms_situacao_tributaria" text NOT NULL,
	"pis_situacao_tributaria" text NOT NULL,
	"cofins_situacao_tributaria" text NOT NULL,
	"natureza_operacao" text NOT NULL,
	"informacoes_complementares" text,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_devolucao_id_devolucoes_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_emitida_por_usuarios_id_fk" FOREIGN KEY ("emitida_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_venda" ADD CONSTRAINT "notas_venda_devolucao_id_devolucoes_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_venda" ADD CONSTRAINT "notas_venda_anexada_por_usuarios_id_fk" FOREIGN KEY ("anexada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_fiscais" ADD CONSTRAINT "regras_fiscais_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_fiscais_devolucao_ativa_uq" ON "notas_fiscais" USING btree ("devolucao_id") WHERE "situacao" <> 'CANCELADA';--> statement-breakpoint
CREATE UNIQUE INDEX "notas_fiscais_lote_ativa_uq" ON "notas_fiscais" USING btree ("lote_id") WHERE "situacao" <> 'CANCELADA';--> statement-breakpoint
CREATE INDEX "notas_fiscais_autorizada_em_idx" ON "notas_fiscais" USING btree ("autorizada_em");--> statement-breakpoint
CREATE INDEX "notas_fiscais_cancelada_em_idx" ON "notas_fiscais" USING btree ("cancelada_em");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_venda_devolucao_chave_uq" ON "notas_venda" USING btree ("devolucao_id","chave");--> statement-breakpoint
CREATE UNIQUE INDEX "regras_fiscais_tipo_operacao_uq" ON "regras_fiscais" USING btree ("tipo_nota","operacao");