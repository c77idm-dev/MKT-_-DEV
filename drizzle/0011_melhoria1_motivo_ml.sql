CREATE TABLE "motivos_reclamacao_ml" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"consultado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "motivo_id" text;