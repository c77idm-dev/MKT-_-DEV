ALTER TABLE "devolucoes" ADD COLUMN "apagada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD COLUMN "apagada_por" uuid;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD COLUMN "expurgada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retiradas_full" ADD COLUMN "apagada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retiradas_full" ADD COLUMN "apagada_por" uuid;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_apagada_por_usuarios_id_fk" FOREIGN KEY ("apagada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retiradas_full" ADD CONSTRAINT "retiradas_full_apagada_por_usuarios_id_fk" FOREIGN KEY ("apagada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;