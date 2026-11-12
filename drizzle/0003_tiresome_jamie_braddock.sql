CREATE TYPE "public"."situacao_importacao" AS ENUM('PENDENTE', 'CONCLUIDA');--> statement-breakpoint
CREATE TYPE "public"."tipo_importacao" AS ENUM('produtos', 'fornecedores', 'devolucoes');--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_importacao" NOT NULL,
	"nome_arquivo" text NOT NULL,
	"cabecalhos" jsonb NOT NULL,
	"linhas" jsonb NOT NULL,
	"linha_cabecalho" integer DEFAULT 1 NOT NULL,
	"mapeamento" jsonb,
	"situacao" "situacao_importacao" DEFAULT 'PENDENTE' NOT NULL,
	"resumo" jsonb,
	"criado_por" uuid NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluida_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mapeamentos_importacao" (
	"tipo" "tipo_importacao" PRIMARY KEY NOT NULL,
	"mapeamento" jsonb NOT NULL,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapeamentos_importacao" ADD CONSTRAINT "mapeamentos_importacao_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;