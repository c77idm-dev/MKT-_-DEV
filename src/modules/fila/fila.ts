import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss, type DrizzleTransactionLike } from 'pg-boss';
import type { DbOuTx } from '@/db/client';
import { lerEnv } from '@/lib/env';
import { CONFIG_TAREFAS, NOMES_TAREFAS, type DadosTarefa, type NomeTarefa } from './tarefas';

export type OpcoesEnvio = { tx?: DbOuTx; chaveUnica?: string; iniciarEm?: Date };

export interface Fila {
  enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void>;
}

/** Schema do pg-boss no banco da aplicação (cada worktree tem o seu banco e, portanto, o seu schema). */
export const SCHEMA_FILA = 'pgboss';

/** Opções da fila no pg-boss: `retryLimit` conta só as novas tentativas, então 5 tentativas = 4 (teste na Tarefa 5). */
export function opcoesDaFila(nome: NomeTarefa) {
  const c = CONFIG_TAREFAS[nome];
  return { retryLimit: c.tentativas - 1, retryDelay: 30, retryBackoff: true, retryDelayMax: 900, expireInSeconds: c.expiraEmSegundos };
}

/**
 * `chaveUnica` vira o id do job (um UUID calculado de tarefa + chave). O pg-boss grava com ON CONFLICT DO NOTHING,
 * então um segundo envio com a mesma chave é ignorado, em qualquer política de fila.
 */
export function idDoJob(nome: NomeTarefa, chave: string): string {
  const h = createHash('sha256').update(`${nome}\u0000${chave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function criarPgBoss(url: string, opcoes: { max: number; supervisionar: boolean; schema?: string }): PgBoss {
  const boss = new PgBoss({
    connectionString: url,
    schema: opcoes.schema ?? SCHEMA_FILA,
    max: opcoes.max,
    // Só o worker faz a manutenção e as agendas; o web só envia.
    supervise: opcoes.supervisionar,
    schedule: opcoes.supervisionar,
  });
  boss.on('error', (erro) => {
    console.error(JSON.stringify({ nivel: 'erro', origem: 'pg-boss', mensagem: erro.message }));
  });
  return boss;
}

/** Cria (ou atualiza) as filas de todas as tarefas. Pode rodar quantas vezes quiser. */
export async function criarFilas(boss: PgBoss): Promise<void> {
  for (const nome of NOMES_TAREFAS) {
    await boss.createQueue(nome, opcoesDaFila(nome));
    await boss.updateQueue(nome, opcoesDaFila(nome));
  }
}

export async function enviarPorPgBoss<N extends NomeTarefa>(
  boss: PgBoss,
  nome: N,
  dados: DadosTarefa[N],
  opcoes: OpcoesEnvio = {},
): Promise<void> {
  await boss.send(nome, dados, {
    ...(opcoes.chaveUnica ? { id: idDoJob(nome, opcoes.chaveUnica) } : {}),
    ...(opcoes.iniciarEm ? { startAfter: opcoes.iniciarEm } : {}),
    // Dentro da transação do domínio: se ela desfaz, a tarefa some junto.
    ...(opcoes.tx ? { db: fromDrizzle(opcoes.tx as unknown as DrizzleTransactionLike, sql) } : {}),
  });
}

/** A fila do web: liga o pg-boss no primeiro uso (cria o schema e as filas) e reaproveita a conexão. */
export class FilaPgBoss implements Fila {
  private ligando: Promise<PgBoss> | null = null;

  constructor(private readonly url: string) {}

  ligar(): Promise<PgBoss> {
    this.ligando ??= (async () => {
      const boss = criarPgBoss(this.url, { max: 3, supervisionar: false });
      await boss.start();
      await criarFilas(boss);
      return boss;
    })().catch((erro: unknown) => {
      this.ligando = null;
      throw erro;
    });
    return this.ligando;
  }

  async enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void> {
    await enviarPorPgBoss(await this.ligar(), nome, dados, opcoes);
  }
}

/** Para os testes: guarda os envios em memória (mesmo dentro de uma transação que depois desfaz). */
export class FilaMemoria implements Fila {
  readonly enviadas: { nome: NomeTarefa; dados: unknown; opcoes?: OpcoesEnvio }[] = [];

  async enviar<N extends NomeTarefa>(nome: N, dados: DadosTarefa[N], opcoes?: OpcoesEnvio): Promise<void> {
    this.enviadas.push(opcoes === undefined ? { nome, dados } : { nome, dados, opcoes });
  }
}

let filaParaTestes: Fila | null = null;
// No globalThis para o recarregamento do `next dev` não abrir um pg-boss novo a cada edição.
const globalComFila = globalThis as unknown as { __filaPgBoss?: FilaPgBoss };

function filaPadrao(): FilaPgBoss {
  globalComFila.__filaPgBoss ??= new FilaPgBoss(lerEnv().DATABASE_URL);
  return globalComFila.__filaPgBoss;
}

export function obterFila(): Fila {
  return filaParaTestes ?? filaPadrao();
}

export function definirFilaParaTestes(f: Fila | null): void {
  filaParaTestes = f;
}

/** Para o /saude (spec §11): o pg-boss liga e o schema dele existe. */
export async function verificarFila(): Promise<void> {
  if (filaParaTestes) return;
  const boss = await filaPadrao().ligar();
  if (!(await boss.isInstalled())) throw new Error('O schema da fila não está instalado.');
}
