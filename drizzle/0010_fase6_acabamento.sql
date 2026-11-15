CREATE TYPE "public"."situacao_backup" AS ENUM('EM_ANDAMENTO', 'OK', 'FALHOU');--> statement-breakpoint
CREATE TYPE "public"."situacao_falha" AS ENUM('ABERTA', 'REENVIADA', 'DISPENSADA');--> statement-breakpoint
CREATE TABLE "execucoes_backup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminado_em" timestamp with time zone,
	"situacao" "situacao_backup" DEFAULT 'EM_ANDAMENTO' NOT NULL,
	"arquivo_banco" text,
	"tamanho_banco" bigint,
	"arquivo_midia" text,
	"tamanho_midia" bigint,
	"erro" text
);
--> statement-breakpoint
CREATE TABLE "falhas_tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa" text NOT NULL,
	"dados" jsonb NOT NULL,
	"assinatura" text NOT NULL,
	"erro" text NOT NULL,
	"tentativas" integer NOT NULL,
	"ocorrencias" integer DEFAULT 1 NOT NULL,
	"ultimo_job_id" uuid NOT NULL,
	"primeira_falha_em" timestamp with time zone NOT NULL,
	"ultima_falha_em" timestamp with time zone NOT NULL,
	"situacao" "situacao_falha" DEFAULT 'ABERTA' NOT NULL,
	"resolvida_por" uuid,
	"resolvida_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "falhas_tarefas" ADD CONSTRAINT "falhas_tarefas_resolvida_por_usuarios_id_fk" FOREIGN KEY ("resolvida_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "falhas_tarefas_aberta_unica" ON "falhas_tarefas" USING btree ("assinatura") WHERE "situacao" = 'ABERTA';--> statement-breakpoint
CREATE INDEX "falhas_tarefas_situacao_idx" ON "falhas_tarefas" USING btree ("situacao","ultima_falha_em");--> statement-breakpoint
CREATE INDEX "eventos_historico_acao_em_idx" ON "eventos_historico" USING btree ("acao","em");