CREATE TYPE "public"."canal" AS ENUM('MERCADO_LIVRE', 'AMAZON', 'SHOPEE', 'MAGALU', 'TIKTOK_SHOP', 'SHEIN');--> statement-breakpoint
CREATE TYPE "public"."origem_devolucao" AS ENUM('API', 'MANUAL', 'PLANILHA');--> statement-breakpoint
CREATE TYPE "public"."status_devolucao" AS ENUM('PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF', 'CONCLUIDA', 'CANCELADA', 'EXTRAVIADA', 'NO_CD_MARKETPLACE');--> statement-breakpoint
CREATE TYPE "public"."status_item" AS ENUM('PENDENTE', 'AGUARDANDO_NF', 'DISPONIVEL_VENDA', 'EM_LOTE', 'ENVIADO', 'RESOLVIDO', 'SEM_FORNECEDOR', 'AUSENTE');--> statement-breakpoint
CREATE TYPE "public"."tipo_devolucao" AS ENUM('DEVOLUCAO', 'TROCA');--> statement-breakpoint
CREATE TABLE "devolucoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" bigserial NOT NULL,
	"codigo" text GENERATED ALWAYS AS ('DEV-' || case when "numero" < 1000000 then lpad("numero"::text, 6, '0') else "numero"::text end) STORED NOT NULL,
	"canal" "canal",
	"origem" "origem_devolucao" NOT NULL,
	"pedidos_externos" text[] DEFAULT '{}'::text[] NOT NULL,
	"reclamacao_id" text,
	"devolucao_externa_id" text,
	"tipo" "tipo_devolucao" DEFAULT 'DEVOLUCAO' NOT NULL,
	"rastreio" text,
	"transportadora" text,
	"status" "status_devolucao" NOT NULL,
	"status_canal" text,
	"entregue_segundo_canal_em" timestamp with time zone,
	"prazo_conferencia_canal" timestamp with time zone,
	"nao_identificada" boolean DEFAULT false NOT NULL,
	"motivo_cliente" text,
	"postada_em" date,
	"observacoes" text,
	"criado_por" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"recebida_em" timestamp with time zone,
	"recebida_por" uuid,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devolucoes_numero_unique" UNIQUE("numero"),
	CONSTRAINT "devolucoes_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "devolucoes_canal_obrigatorio" CHECK ("canal" is not null or "nao_identificada")
);
--> statement-breakpoint
CREATE TABLE "itens_devolucao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"devolucao_id" uuid NOT NULL,
	"unidade" integer NOT NULL,
	"sku" text NOT NULL,
	"produto_esperado_id" uuid,
	"serial" text,
	"status" "status_item" DEFAULT 'PENDENTE' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text NOT NULL,
	"acao" text NOT NULL,
	"de" text,
	"para" text,
	"usuario_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"dados" jsonb
);
--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_recebida_por_usuarios_id_fk" FOREIGN KEY ("recebida_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_devolucao_devolucao_id_devolucoes_id_fk" FOREIGN KEY ("devolucao_id") REFERENCES "public"."devolucoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_devolucao_produto_esperado_id_produtos_id_fk" FOREIGN KEY ("produto_esperado_id") REFERENCES "public"."produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_historico" ADD CONSTRAINT "eventos_historico_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devolucoes_canal_externa_uq" ON "devolucoes" USING btree ("canal","devolucao_externa_id");--> statement-breakpoint
CREATE INDEX "devolucoes_status_idx" ON "devolucoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "devolucoes_rastreio_idx" ON "devolucoes" USING btree ("rastreio");--> statement-breakpoint
CREATE INDEX "itens_devolucao_devolucao_idx" ON "itens_devolucao" USING btree ("devolucao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itens_devolucao_unidade_uq" ON "itens_devolucao" USING btree ("devolucao_id","unidade");--> statement-breakpoint
CREATE INDEX "eventos_historico_entidade_idx" ON "eventos_historico" USING btree ("entidade","entidade_id");