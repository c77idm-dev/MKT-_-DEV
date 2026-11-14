import { createHash } from 'node:crypto';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { contestacoesCanal, devolucoes, evidencias, falhasTarefas, lotes, notasFiscais } from '@/db/schema';
import { formatarDataHora } from '@/lib/formatar';
import { mensagemDoErro } from '@/lib/log';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { obterFila } from '@/modules/fila/fila';
import type { DadosTarefa, NomeTarefa } from '@/modules/fila/tarefas';
import { registrarEvento } from '@/modules/historico/eventos';
import { ehNomeTarefa, ROTULO_TAREFA } from './dominio';

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

export class ErroFalhas extends Error {}

type Tratamento = 'REENVIADA' | 'DISPENSADA';

/** Fecha a falha ABERTA (o `where` impede o clique duplo) e devolve a tarefa; quem chama ainda está na transação. */
async function tratarFalha(
  tx: DbOuTx,
  falhaId: string,
  usuario: UsuarioSessao,
  agora: Date,
  situacao: Tratamento,
): Promise<{ tarefa: string; dados: Record<string, unknown> }> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroFalhas('Só o Gestor trata as Falhas.');
  if (!ehUuid(falhaId)) throw new ErroFalhas('Falha não encontrada.');
  const [linha] = await tx
    .update(falhasTarefas)
    .set({ situacao, resolvidaPor: usuario.id, resolvidaEm: agora })
    .where(and(eq(falhasTarefas.id, falhaId), eq(falhasTarefas.situacao, 'ABERTA')))
    .returning({ tarefa: falhasTarefas.tarefa, dados: falhasTarefas.dados });
  if (!linha) {
    const [existe] = await tx.select({ id: falhasTarefas.id }).from(falhasTarefas).where(eq(falhasTarefas.id, falhaId));
    throw new ErroFalhas(existe ? 'Esta falha já foi tratada.' : 'Falha não encontrada.');
  }
  return linha;
}

/** Spec §6.8, tentar de novo: reenvia a mesma tarefa com os mesmos dados, sem chave única (decisão 3). */
export async function reenviarFalha(db: Db, falhaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<{ tarefa: NomeTarefa }> {
  return db.transaction(async (tx) => {
    const { tarefa, dados } = await tratarFalha(tx, falhaId, usuario, agora, 'REENVIADA');
    if (!ehNomeTarefa(tarefa)) throw new ErroFalhas('Falha não encontrada.');
    await obterFila().enviar(tarefa, dados as DadosTarefa[typeof tarefa], { tx });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'falhas',
      acao: 'tarefa_reenviada',
      usuarioId: usuario.id,
      em: agora,
      dados: { falhaId, tarefa },
    });
    return { tarefa };
  });
}

/** (extra, decisão 4) Dá a falha por tratada sem reenviar. */
export async function dispensarFalha(db: Db, falhaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const { tarefa } = await tratarFalha(tx, falhaId, usuario, agora, 'DISPENSADA');
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'falhas',
      acao: 'tarefa_dispensada',
      usuarioId: usuario.id,
      em: agora,
      dados: { falhaId, tarefa },
    });
  });
}

export type ReferenciaFalha = { texto: string; href: string | null };
export type FalhaVista = {
  id: string;
  tarefa: string;
  rotuloTarefa: string;
  erro: string;
  tentativas: number;
  ocorrencias: number;
  primeiraFalhaEm: string;
  ultimaFalhaEm: string;
  referencia: ReferenciaFalha | null;
};

const POR_PAGINA = 20;

function texto(dados: Record<string, unknown>, chave: string): string | null {
  const v = dados[chave];
  return typeof v === 'string' && v !== '' ? v : null;
}
function idValido(dados: Record<string, unknown>, chave: string): string | null {
  const v = texto(dados, chave);
  return v && ehUuid(v) ? v : null;
}

/** Referências das falhas em lote: no máximo uma consulta por tipo de dado. */
async function buscarReferencias(
  db: DbOuTx,
  linhas: { id: string; dados: Record<string, unknown> }[],
): Promise<Map<string, ReferenciaFalha | null>> {
  const ids = (chave: string) => [...new Set(linhas.map((l) => idValido(l.dados, chave)).filter((v): v is string => v !== null))];
  const idsDev = ids('devolucaoId');
  const idsEvid = ids('evidenciaId');
  const idsNota = ids('notaFiscalId');
  const idsContest = ids('contestacaoId');

  const evid = idsEvid.length
    ? await db.select({ id: evidencias.id, devolucaoId: evidencias.devolucaoId }).from(evidencias).where(inArray(evidencias.id, idsEvid))
    : [];
  const notas = idsNota.length
    ? await db
        .select({ id: notasFiscais.id, devolucaoId: notasFiscais.devolucaoId, loteId: notasFiscais.loteId })
        .from(notasFiscais)
        .where(inArray(notasFiscais.id, idsNota))
    : [];
  const contest = idsContest.length
    ? await db
        .select({ id: contestacoesCanal.id, devolucaoId: contestacoesCanal.devolucaoId })
        .from(contestacoesCanal)
        .where(inArray(contestacoesCanal.id, idsContest))
    : [];

  const todasDev = [
    ...new Set(
      [...idsDev, ...evid.map((e) => e.devolucaoId), ...notas.map((n) => n.devolucaoId), ...contest.map((c) => c.devolucaoId)].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  const todosLotes = [...new Set(notas.map((n) => n.loteId).filter((v): v is string => !!v))];
  const devs = todasDev.length
    ? await db.select({ id: devolucoes.id, codigo: devolucoes.codigo }).from(devolucoes).where(inArray(devolucoes.id, todasDev))
    : [];
  const lts = todosLotes.length ? await db.select({ id: lotes.id, codigo: lotes.codigo }).from(lotes).where(inArray(lotes.id, todosLotes)) : [];
  const codigoDev = new Map(devs.map((d) => [d.id, d.codigo]));
  const codigoLote = new Map(lts.map((l) => [l.id, l.codigo]));
  const evidDev = new Map(evid.map((e) => [e.id, e.devolucaoId]));
  const notaPor = new Map(notas.map((n) => [n.id, n]));
  const contestDev = new Map(contest.map((c) => [c.id, c.devolucaoId]));

  const dev = (devolucaoId: string | null | undefined, prefixo = ''): ReferenciaFalha | null => {
    const codigo = devolucaoId ? codigoDev.get(devolucaoId) : undefined;
    return codigo ? { texto: `${prefixo}${codigo}`, href: `/fluxo/devolucoes/${codigo}` } : null;
  };

  const mapa = new Map<string, ReferenciaFalha | null>();
  for (const { id, dados } of linhas) {
    let ref: ReferenciaFalha | null = null;
    const devolucaoId = idValido(dados, 'devolucaoId');
    const evidenciaId = idValido(dados, 'evidenciaId');
    const notaId = idValido(dados, 'notaFiscalId');
    const contestacaoId = idValido(dados, 'contestacaoId');
    const claimId = texto(dados, 'claimId');
    if (devolucaoId) ref = dev(devolucaoId);
    else if (evidenciaId) ref = dev(evidDev.get(evidenciaId));
    else if (notaId) {
      const nota = notaPor.get(notaId);
      ref = dev(nota?.devolucaoId);
      if (!ref && nota?.loteId) {
        const codigo = codigoLote.get(nota.loteId);
        if (codigo) ref = { texto: codigo, href: `/lotes/${codigo}` };
      }
    } else if (contestacaoId) {
      const d = dev(contestDev.get(contestacaoId), 'Contestação da ');
      ref = d ? { texto: d.texto, href: `/contestacoes/${contestacaoId}` } : null;
    } else if (claimId) ref = { texto: `Reclamação ${claimId}`, href: null };
    mapa.set(id, ref);
  }
  return mapa;
}

/** Só as ABERTAS, a mais recente primeiro (20 por página). */
export async function listarFalhas(
  db: DbOuTx,
  opcoes: { pagina?: number; porPagina?: number } = {},
): Promise<{ falhas: FalhaVista[]; total: number }> {
  const porPagina = Math.max(1, opcoes.porPagina ?? POR_PAGINA);
  const pagina = Math.max(1, Math.trunc(opcoes.pagina ?? 1) || 1);
  const linhas = await db
    .select()
    .from(falhasTarefas)
    .where(eq(falhasTarefas.situacao, 'ABERTA'))
    .orderBy(desc(falhasTarefas.ultimaFalhaEm), desc(falhasTarefas.id))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  const total = await contarFalhasAbertas(db);
  const referencias = await buscarReferencias(db, linhas);
  return {
    total,
    falhas: linhas.map((l) => ({
      id: l.id,
      tarefa: l.tarefa,
      rotuloTarefa: ehNomeTarefa(l.tarefa) ? ROTULO_TAREFA[l.tarefa] : l.tarefa,
      erro: l.erro,
      tentativas: l.tentativas,
      ocorrencias: l.ocorrencias,
      primeiraFalhaEm: formatarDataHora(l.primeiraFalhaEm),
      ultimaFalhaEm: formatarDataHora(l.ultimaFalhaEm),
      referencia: referencias.get(l.id) ?? null,
    })),
  };
}

export async function contarFalhasAbertas(db: DbOuTx): Promise<number> {
  const [linha] = await db.select({ n: count() }).from(falhasTarefas).where(eq(falhasTarefas.situacao, 'ABERTA'));
  return linha?.n ?? 0;
}
