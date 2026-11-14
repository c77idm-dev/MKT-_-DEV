import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { falhasTarefas } from '@/db/schema';
import { mensagemDoErro } from '@/lib/log';
import { ehNomeTarefa } from './dominio';

export type EntradaFalha = {
  tarefa: string;
  dados: unknown;
  erro: unknown;
  tentativas: number;
  jobId: string;
  falhouEm: Date;
};

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, ordenar(v)]),
    );
  }
  return valor;
}

/** sha256 em hex de tarefa + NUL + JSON com as chaves ordenadas (decisão 2). */
export function assinaturaFalha(tarefa: string, dados: unknown): string {
  return createHash('sha256').update(`${tarefa}\u0000${JSON.stringify(ordenar(dados)) ?? 'null'}`).digest('hex');
}

type JobMorto = {
  id: string;
  data: unknown;
  sourceName: string | null;
  sourceId: string | null;
  sourceOutput: object | null;
  sourceRetryCount: number | null;
  createdOn: Date;
};

/** Converte o job da fila `falhas` (dead letter) na falha da tarefa original; `null` se ele não veio de outra fila. */
export function entradaDoJobMorto(job: JobMorto): EntradaFalha | null {
  if (!job.sourceName || !job.sourceId) return null;
  return {
    tarefa: job.sourceName,
    dados: job.data,
    erro: job.sourceOutput,
    tentativas: (job.sourceRetryCount ?? 0) + 1,
    jobId: job.sourceId,
    falhouEm: job.createdOn,
  };
}

/** Grava a falha; a mesma tarefa com os mesmos dados soma ocorrências na linha ABERTA (o mesmo job não conta duas vezes). */
export async function registrarFalha(db: DbOuTx, e: EntradaFalha): Promise<{ falhaId: string } | null> {
  if (!ehNomeTarefa(e.tarefa)) {
    console.log(JSON.stringify({ em: new Date().toISOString(), nivel: 'aviso', origem: 'falhas', mensagem: 'tarefa fora do contrato ignorada', tarefa: e.tarefa }));
    return null;
  }
  const dados =
    e.dados !== null && typeof e.dados === 'object' && !Array.isArray(e.dados)
      ? (e.dados as Record<string, unknown>)
      : { valor: e.dados };
  const [linha] = await db
    .insert(falhasTarefas)
    .values({
      tarefa: e.tarefa,
      dados,
      assinatura: assinaturaFalha(e.tarefa, e.dados),
      erro: mensagemDoErro(e.erro),
      tentativas: e.tentativas,
      ultimoJobId: e.jobId,
      primeiraFalhaEm: e.falhouEm,
      ultimaFalhaEm: e.falhouEm,
    })
    .onConflictDoUpdate({
      target: falhasTarefas.assinatura,
      targetWhere: sql`"situacao" = 'ABERTA'`,
      set: {
        ocorrencias: sql`case when ${falhasTarefas.ultimoJobId} = excluded.ultimo_job_id then ${falhasTarefas.ocorrencias} else ${falhasTarefas.ocorrencias} + 1 end`,
        erro: sql`excluded.erro`,
        tentativas: sql`excluded.tentativas`,
        ultimoJobId: sql`excluded.ultimo_job_id`,
        ultimaFalhaEm: sql`greatest(${falhasTarefas.ultimaFalhaEm}, excluded.ultima_falha_em)`,
      },
    })
    .returning({ id: falhasTarefas.id });
  return { falhaId: linha.id };
}
