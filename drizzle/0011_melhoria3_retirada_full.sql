CREATE TYPE "public"."situacao_retirada_full" AS ENUM('ABERTA', 'CONFERIDA');--> statement-breakpoint
CREATE TABLE "itens_retirada_full" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retirada_id" uuid NOT NULL,
	"produto_id" uuid,
	"ean_lido" text,
	"descricao" text,
	"quantidade" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_retirada_full_quantidade" CHECK ("quantidade" > 0),
	CONSTRAINT "itens_retirada_full_descricao" CHECK ("produto_id" is not null or ("descricao" is not null and length(trim("descricao")) > 0))
);
--> statement-breakpoint
CREATE TABLE "retiradas_full" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" bigserial NOT NULL,
	"codigo" text GENERATED ALWAYS AS ('RF-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end) STORED NOT NULL,
	"codigo_etiqueta" text NOT NULL,
	"situacao" "situacao_retirada_full" DEFAULT 'ABERTA' NOT NULL,
	"recebida_por" uuid,
	"recebida_em" timestamp with time zone NOT NULL,
	"concluida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retiradas_full_numero_unique" UNIQUE("numero"),
	CONSTRAINT "retiradas_full_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "retiradas_full_concluida" CHECK (("situacao" = 'CONFERIDA') = ("concluida_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "evidencias" DROP CONSTRAINT "evidencias_item_obrigatorio";--> statement-breakpoint
ALTER TABLE "evidencias" ALTER COLUMN "devolucao_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN "retirada_id" uuid;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN "item_retirada_id" uuid;--> statement-breakpoint
ALTER TABLE "itens_retirada_full" ADD CONSTRAINT "itens_retirada_full_retirada_id_retiradas_full_id_fk" FOREIGN KEY ("retirada_id") REFERENCES "public"."retiradas_full"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_retirada_full" ADD CONSTRAINT "itens_retirada_full_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas_full" ADD CONSTRAINT "retiradas_full_recebida_por_usuarios_id_fk" FOREIGN KEY ("recebida_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_retirada_full_retirada_idx" ON "itens_retirada_full" USING btree ("retirada_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itens_retirada_full_produto_uq" ON "itens_retirada_full" USING btree ("retirada_id","produto_id") WHERE "produto_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "itens_retirada_full_ean_uq" ON "itens_retirada_full" USING btree ("retirada_id","ean_lido") WHERE "produto_id" is null;--> statement-breakpoint
CREATE INDEX "retiradas_full_etiqueta_idx" ON "retiradas_full" USING btree ("codigo_etiqueta");--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_retirada_id_retiradas_full_id_fk" FOREIGN KEY ("retirada_id") REFERENCES "public"."retiradas_full"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_item_retirada_id_itens_retirada_full_id_fk" FOREIGN KEY ("item_retirada_id") REFERENCES "public"."itens_retirada_full"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidencias_retirada_idx" ON "evidencias" USING btree ("retirada_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidencias_retirada_tipo_uq" ON "evidencias" USING btree ("retirada_id","tipo") WHERE "retirada_id" is not null and "item_retirada_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "evidencias_item_retirada_tipo_uq" ON "evidencias" USING btree ("item_retirada_id","tipo") WHERE "item_retirada_id" is not null;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_dono" CHECK (num_nonnulls("devolucao_id", "retirada_id") = 1);--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_item_retirada" CHECK ("item_retirada_id" is null or ("retirada_id" is not null and "item_id" is null));--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_item_obrigatorio" CHECK ("tipo" not in ('FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL') or "item_id" is not null or "item_retirada_id" is not null);