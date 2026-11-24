CREATE TABLE "vendas_ml" (
	"pedido_id" text PRIMARY KEY NOT NULL,
	"conta" text,
	"vendida_em" timestamp with time zone,
	"situacao" text,
	"situacao_envio" text,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"atualizada_em" timestamp with time zone NOT NULL
);
