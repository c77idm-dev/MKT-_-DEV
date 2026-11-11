CREATE TABLE "notificacoes_recebidas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"canal" text NOT NULL,
	"topico" text,
	"recurso" text,
	"payload" jsonb NOT NULL,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processada_em" timestamp with time zone
);
