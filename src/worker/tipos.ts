import type { Db } from '@/db/client';
import type { Fila } from '@/modules/fila/fila';
import type { DadosTarefa, NomeTarefa } from '@/modules/fila/tarefas';

/** Contrato §5.1. `tentativa` começa em 1; a 5ª é a última (spec §11). */
export type ContextoTarefa = { db: Db; fila: Fila; agora: Date; tentativa: number };

/**
 * Manipulador idempotente: pode rodar duas vezes; se a entidade não existe mais, termina sem erro.
 * Lançar exceção = nova tentativa. Erro definitivo de negócio não lança: grava o resultado no domínio.
 */
export type Manipulador<N extends NomeTarefa> = (dados: DadosTarefa[N], ctx: ContextoTarefa) => Promise<void>;

export type Manipuladores = { [N in NomeTarefa]?: Manipulador<N> };
