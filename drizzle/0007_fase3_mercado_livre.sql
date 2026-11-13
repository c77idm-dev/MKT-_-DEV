CREATE TYPE "public"."situacao_conta" AS ENUM('ATIVA', 'RECONECTAR');--> statement-breakpoint
CREATE TYPE "public"."status_contestacao" AS ENUM('AGUARDANDO_GESTOR', 'ENVIADA', 'FALHOU');--> statement-breakpoint
CREATE TABLE "contas_marketplace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" "canal" NOT NULL,
	"seller_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"situacao" "situacao_conta" DEFAULT 'ATIVA' NOT NULL,
	"escopo" text,
	"ultima_sincronizacao_em" timestamp with time zone,
	"conectada_por" uuid,
	"conectada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contestacoes_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"devolucao_id" uuid NOT NULL,
	"motivo_canal" text NOT NULL,
	"mensagem" text NOT NULL,
	"evidencias" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"prazo" timestamp with time zone,
	"status" "status_contestacao" DEFAULT 'AGUARDANDO_GESTOR' NOT NULL,
	"revisado_por" uuid,
	"erro" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contestacoes_canal_devolucao_id_unique" UNIQUE("devolucao_id"),
	CONSTRAINT "contestacoes_canal_motivo" CHECK ("motivo_canal" in ('SRF2', 'SRF3', 'SRF4', 'SRF5', 'SRF6'))
);
--> statement-breakpoint
CREATE TABLE "reclamacoes_ml" (
	"claim_id" text PRIMARY KEY NOT NULL,
	"return_id" text,
	"subtipo" text,
	"status_reclamacao" text,
	"status_devolucao" text,
	"devolucao_id" uuid,
	"atualizada_no_ml_em" timestamp with time zone,
	"sincronizada_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notificacoes_recebidas" ADD COLUMN "referencia_externa" text;--> statement-breakpoint
ALTER TABLE "contas_marketplace" ADD CONSTRAINT "contas_marketplace_conectada_por_usuarios_id_fk" FOREIGN KEY ("conectada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacoes_canal" ADD CONSTRAINT "contestacoes_canal_devolucao_id_devolucoes_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contestacoes_canal" ADD CONSTRAINT "contestacoes_canal_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD CONSTRAINT "reclamacoes_ml_devolucao_id_devolucoes_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contas_marketplace_canal_seller_uq" ON "contas_marketplace" USING btree ("canal","seller_id");--> statement-breakpoint
CREATE INDEX "contestacoes_canal_status_prazo_idx" ON "contestacoes_canal" USING btree ("status","prazo");--> statement-breakpoint
CREATE INDEX "reclamacoes_ml_devolucao_idx" ON "reclamacoes_ml" USING btree ("devolucao_id");--> statement-breakpoint
CREATE INDEX "reclamacoes_ml_return_idx" ON "reclamacoes_ml" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "reclamacoes_ml_subtipo_idx" ON "reclamacoes_ml" USING btree ("subtipo");--> statement-breakpoint
CREATE INDEX "notificacoes_recebidas_referencia_idx" ON "notificacoes_recebidas" USING btree ("canal","referencia_externa");