import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, contestacoesCanal, devolucoes, reclamacoesMl } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DadosSelo } from '@/modules/devolucoes/selos';
import { registrarEvento } from '@/modules/historico/eventos';
import { configML, type ConfigML } from './config';
import { ErroContestacao } from './contestacoes';
import { seloPrazoML } from './selos';

const SO_NO_BITBRAIN = 'A resposta à mão só vale no modo Bitbrain (ML_CONECTOR=bitbrain).';

function exigirGestorNoBitbrain(usuario: UsuarioSessao, config: ConfigML): void {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContestacao(['Só o Gestor marca as respostas dadas no ML.']);
  if (config.modo !== 'bitbrain') throw new ErroContestacao([SO_NO_BITBRAIN]);
}

export type OkPendente = {
  devolucaoId: string;
  codigo: string;
  pedidos: string[];
  reclamacaoId: string;
  conta: string | null;
  prazo: Date | null;
  selo: DadosSelo | null;
};

/** "OK para responder no ML" (extra, §4.6): as devoluções conferidas sem problema que esperam o "OK" à mão. */
export async function listarOkPendentes(db: DbOuTx, agora: Date = new Date()): Promise<OkPendente[]> {
  const linhas = await db
    .select({
      devolucaoId: devolucoes.id,
      codigo: devolucoes.codigo,
      pedidos: devolucoes.pedidosExternos,
      reclamacaoId: reclamacoesMl.claimId,
      conta: sql<string | null>`coalesce(${contasBitbrain.nome}, ${reclamacoesMl.conta})`,
      prazo: devolucoes.prazoConferenciaCanal,
    })
    .from(reclamacoesMl)
    .innerJoin(devolucoes, eq(devolucoes.id, reclamacoesMl.devolucaoId))
    .leftJoin(contasBitbrain, eq(contasBitbrain.empresa, reclamacoesMl.conta))
    .where(eq(reclamacoesMl.respostaPendente, 'OK'))
    .orderBy(sql`${devolucoes.prazoConferenciaCanal} asc nulls last`, asc(devolucoes.numero))
    .limit(200);
  return linhas.map((l) => ({ ...l, selo: seloPrazoML(l.prazo, agora) }));
}

/** "Marcar como respondido": limpa a pendência e registra quem respondeu (§4.6). */
export async function marcarOkRespondido(
  db: DbOuTx,
  devolucaoId: string,
  usuario: UsuarioSessao,
  agora: Date,
  config: ConfigML = configML(),
): Promise<void> {
  exigirGestorNoBitbrain(usuario, config);
  if (!ehUuid(devolucaoId)) throw new ErroContestacao(['Devolução não encontrada.']);
  await db.transaction(async (tx) => {
    const limpas = await tx
      .update(reclamacoesMl)
      .set({ respostaPendente: null })
      .where(and(eq(reclamacoesMl.devolucaoId, devolucaoId), eq(reclamacoesMl.respostaPendente, 'OK')))
      .returning({ claimId: reclamacoesMl.claimId });
    if (limpas.length === 0) throw new ErroContestacao(['Esta devolução não tem "OK" para responder no ML.']);
    await registrarEvento(tx, { entidade: 'devolucao', entidadeId: devolucaoId, acao: 'ml_ok_respondido_a_mao', usuarioId: usuario.id, em: agora });
  });
}

/** "Marcar como respondida" (extra, §4.6): a contestação vai a ENVIADA, com o evento e o usuário. */
export async function marcarContestacaoRespondida(
  db: DbOuTx,
  id: string,
  usuario: UsuarioSessao,
  agora: Date,
  config: ConfigML = configML(),
): Promise<void> {
  exigirGestorNoBitbrain(usuario, config);
  if (!ehUuid(id)) throw new ErroContestacao(['Contestação não encontrada.']);
  const [c] = await db
    .select({ status: contestacoesCanal.status, devolucaoId: contestacoesCanal.devolucaoId, motivo: contestacoesCanal.motivoCanal })
    .from(contestacoesCanal)
    .where(eq(contestacoesCanal.id, id));
  if (!c) throw new ErroContestacao(['Contestação não encontrada.']);
  if (c.status === 'ENVIADA') throw new ErroContestacao(['Esta contestação já está marcada como respondida.']);
  await db.transaction(async (tx) => {
    const [mudou] = await tx
      .update(contestacoesCanal)
      .set({ status: 'ENVIADA', enviadaEm: agora, revisadoPor: usuario.id, erro: null, atualizadaEm: agora })
      .where(and(eq(contestacoesCanal.id, id), eq(contestacoesCanal.status, c.status)))
      .returning({ id: contestacoesCanal.id });
    if (!mudou) throw new ErroContestacao(['Outra pessoa acabou de marcar esta contestação. Atualize a tela.']);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: c.devolucaoId,
      acao: 'ml_contestacao_respondida_a_mao',
      usuarioId: usuario.id,
      dados: { contestacaoId: id, motivo: c.motivo },
      em: agora,
    });
  });
}

/** Alerta "Respostas para dar no ML" (D10): os "OK" pendentes mais as contestações que esperam o Gestor ou falharam. */
export async function contarRespostasParaDarNoML(db: DbOuTx): Promise<number> {
  const [ok] = await db.select({ total: count() }).from(reclamacoesMl).where(eq(reclamacoesMl.respostaPendente, 'OK'));
  const [contestacoes] = await db
    .select({ total: count() })
    .from(contestacoesCanal)
    .where(inArray(contestacoesCanal.status, ['AGUARDANDO_GESTOR', 'FALHOU']));
  return Number(ok?.total ?? 0) + Number(contestacoes?.total ?? 0);
}
