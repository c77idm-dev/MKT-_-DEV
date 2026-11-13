import type { PgBoss } from 'pg-boss';
import { criarDb, type Db } from '@/db/client';
import { criarFilas, criarPgBoss, enviarPorPgBoss, type Fila } from '@/modules/fila/fila';
import { CONFIG_TAREFAS, FUSO_AGENDAS, NOMES_TAREFAS, TAREFAS_NA_SUBIDA, type DadosTarefa, type NomeTarefa } from '@/modules/fila/tarefas';
import { manipuladoresAcabamento } from './manipuladores/acabamento';
import { manipuladoresFiscal } from './manipuladores/fiscal';
import { manipuladoresLotes } from './manipuladores/lotes';
import { manipuladoresMercadoLivre } from './manipuladores/mercado-livre';
import { manipuladoresMidia } from './manipuladores/midia';
import type { Manipulador, Manipuladores } from './tipos';

/** A junção dos manipuladores de todas as fases (cada uma preenche só o seu arquivo). */
export const MANIPULADORES: Manipuladores = {
  ...manipuladoresMidia,
  ...manipuladoresMercadoLivre,
  ...manipuladoresFiscal,
  ...manipuladoresLotes,
  ...manipuladoresAcabamento,
};

type Registro = (linha: Record<string, unknown>) => void;

/** Log estruturado em JSON (spec §11). */
const registrarNoConsole: Registro = (linha) => {
  console.log(JSON.stringify({ em: new Date().toISOString(), origem: 'worker', ...linha }));
};

/** Roda o manipulador de uma tarefa. O pg-boss conta as novas tentativas em `retryCount`; aqui a tentativa começa em 1. */
export async function executarTarefa<N extends NomeTarefa>(
  manipuladores: Manipuladores,
  nome: N,
  job: { data: DadosTarefa[N]; retryCount: number },
  base: { db: Db; fila: Fila },
  agora: Date = new Date(),
): Promise<void> {
  const manipulador = manipuladores[nome] as Manipulador<N> | undefined;
  if (!manipulador) throw new Error(`Nenhum manipulador para a tarefa ${nome}`);
  await manipulador(job.data, { db: base.db, fila: base.fila, agora, tentativa: job.retryCount + 1 });
}

export type OpcoesWorker = {
  url: string;
  manipuladores?: Manipuladores;
  /** Só nos testes: um schema do pg-boss separado. */
  schema?: string;
  intervaloSegundos?: number;
  registrar?: Registro;
};

/** Liga o pg-boss com manutenção e agendas, e trabalha nas filas que têm manipulador. */
export async function iniciarWorker(o: OpcoesWorker): Promise<{ boss: PgBoss; parar(): Promise<void> }> {
  const manipuladores = o.manipuladores ?? MANIPULADORES;
  const registrar = o.registrar ?? registrarNoConsole;
  const boss = criarPgBoss(o.url, { max: 5, supervisionar: true, schema: o.schema });
  await boss.start();
  await criarFilas(boss);
  const { db, sql } = criarDb(o.url);
  const fila: Fila = { enviar: (nome, dados, opcoes) => enviarPorPgBoss(boss, nome, dados, opcoes) };

  const ativas = NOMES_TAREFAS.filter((nome) => manipuladores[nome]);
  for (const nome of ativas) {
    // Uma tarefa por vez em cada fila: ffmpeg e sharp disputam a única vCPU com o site (pesquisa §5.2).
    await boss.work(nome, { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: o.intervaloSegundos ?? 2 }, async ([job]) => {
      const inicio = Date.now();
      const tentativa = job.retryCount + 1;
      try {
        await executarTarefa(manipuladores, nome, job as { data: DadosTarefa[typeof nome]; retryCount: number }, { db, fila });
        registrar({ nivel: 'info', tarefa: nome, id: job.id, tentativa, ms: Date.now() - inicio });
      } catch (erro) {
        registrar({ nivel: 'erro', tarefa: nome, id: job.id, tentativa, mensagem: erro instanceof Error ? erro.message : String(erro) });
        throw erro;
      }
    });
    const agenda = CONFIG_TAREFAS[nome].agenda;
    if (agenda) await boss.schedule(nome, agenda, {}, { tz: FUSO_AGENDAS });
  }
  for (const nome of TAREFAS_NA_SUBIDA) {
    if (manipuladores[nome]) await fila.enviar(nome, {});
  }
  registrar({ nivel: 'info', mensagem: 'worker iniciado', tarefas: ativas });

  return {
    boss,
    async parar() {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await sql.end();
    },
  };
}
