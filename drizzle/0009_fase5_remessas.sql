CREATE TYPE "public"."resultado_fornecedor" AS ENUM('TROCADO', 'CONSERTADO', 'CREDITO', 'DESCARTADO', 'DEVOLVIDO_SEM_SOLUCAO');--> statement-breakpoint
CREATE TYPE "public"."status_lote" AS ENUM('ABERTO', 'FECHADO', 'NF_EMITIDA', 'ENVIADO', 'FINALIZADO');--> statement-breakpoint
CREATE TYPE "public"."tipo_lote" AS ENUM('CONSERTO', 'TROCA', 'GARANTIA');--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" bigserial NOT NULL,
	"codigo" text GENERATED ALWAYS AS ('LOT-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end) STORED NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"tipo" "tipo_lote",
	"status" "status_lote" DEFAULT 'ABERTO' NOT NULL,
	"rastreio_envio" text,
	"nota_fiscal_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fechado_em" timestamp with time zone,
	"fechado_por" uuid,
	"enviado_em" timestamp with time zone,
	"finalizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lotes_numero_unique" UNIQUE("numero"),
	CONSTRAINT "lotes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "lote_id" uuid;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD COLUMN "resultado_fornecedor" "resultado_fornecedor";--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_nota_fiscal_id_notas_fiscais_id_fk" FOREIGN KEY ("nota_fiscal_id") REFERENCES "public"."notas_fiscais"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_fechado_por_usuarios_id_fk" FOREIGN KEY ("fechado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lotes_fornecedor_aberto_uq" ON "lotes" USING btree ("fornecedor_id") WHERE "status" = 'ABERTO';--> statement-breakpoint
CREATE INDEX "lotes_status_idx" ON "lotes" USING btree ("status");--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_devolucao_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_devolucao_lote_idx" ON "itens_devolucao" USING btree ("lote_id");--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_lote_status" CHECK (("lote_id" is not null) = ("status" in ('EM_LOTE', 'ENVIADO', 'RESOLVIDO')));--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_resultado_resolvido" CHECK (("resultado_fornecedor" is not null) = ("status" = 'RESOLVIDO'));