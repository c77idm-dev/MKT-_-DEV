CREATE TABLE "contas_bitbrain" (
	"empresa" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"seller_id" text NOT NULL,
	"recebe_devolucoes" boolean DEFAULT false NOT NULL,
	"disponivel" boolean DEFAULT true NOT NULL,
	"ultima_sincronizacao_em" timestamp with time zone,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_por" uuid
);
--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "conta" text;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "acao_pendente" text;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "urgente" boolean;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "afeta_reputacao" text;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "eh_full" boolean;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "triagem_condicao" text;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "triagem_etapa" text;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "dinheiro" text;--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD COLUMN "resposta_pendente" text;--> statement-breakpoint
ALTER TABLE "contas_bitbrain" ADD CONSTRAINT "contas_bitbrain_atualizada_por_usuarios_id_fk" FOREIGN KEY ("atualizada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reclamacoes_ml_resposta_pendente_idx" ON "reclamacoes_ml" USING btree ("resposta_pendente");--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD CONSTRAINT "reclamacoes_ml_afeta_reputacao" CHECK ("afeta_reputacao" in ('AFETA', 'NAO_AFETA', 'NAO_SE_APLICA'));--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD CONSTRAINT "reclamacoes_ml_triagem_condicao" CHECK ("triagem_condicao" in ('VENDAVEL', 'NAO_VENDAVEL', 'DESCARTE', 'FALTANDO'));--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD CONSTRAINT "reclamacoes_ml_dinheiro" CHECK ("dinheiro" in ('RETIDO', 'DEVOLVIDO', 'LIBERADO'));--> statement-breakpoint
ALTER TABLE "reclamacoes_ml" ADD CONSTRAINT "reclamacoes_ml_resposta_pendente" CHECK ("resposta_pendente" in ('OK'));