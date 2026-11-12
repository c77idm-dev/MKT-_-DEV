CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razao_social" text NOT NULL,
	"cnpj" text NOT NULL,
	"ie" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"cep" text,
	"contato_sac" text,
	"email_sac" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"ean" text,
	"descricao" text NOT NULL,
	"fornecedor_id" uuid,
	"ncm" text,
	"custo" numeric(12, 2),
	"unidade" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produtos_ean_idx" ON "produtos" USING btree ("ean");--> statement-breakpoint
CREATE INDEX "produtos_fornecedor_idx" ON "produtos" USING btree ("fornecedor_id");