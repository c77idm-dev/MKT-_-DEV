import { and, asc, count, eq, notInArray } from 'drizzle-orm';
import { ErroBitbrain, listarEmpresasBitbrain, TIMEOUT_EMPRESAS_MS, type EmpresaBitbrain } from '@/conectores/marketplace/bitbrain/cliente';
import type { DbOuTx } from '@/db/client';
import { contasBitbrain, usuarios } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import type { ConfigML } from './config';
import { sincronizacaoAtrasada } from './dominio';
import { fetchDoBitbrain } from './fabrica-conector';

export class ErroContaBitbrain extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroContaBitbrain';
  }
}

export type ContaBitbrain = {
  empresa: string;
  nome: string;
  sellerId: string;
  recebeDevolucoes: boolean;
  disponivel: boolean;
  ultimaSincronizacaoEm: Date | null;
  atualizadaEm: Date;
  atualizadaPorNome: string | null;
};

export async function listarContasBitbrain(db: DbOuTx): Promise<ContaBitbrain[]> {
  return db
    .select({
      empresa: contasBitbrain.empresa,
      nome: contasBitbrain.nome,
      sellerId: contasBitbrain.sellerId,
      recebeDevolucoes: contasBitbrain.recebeDevolucoes,
      disponivel: contasBitbrain.disponivel,
      ultimaSincronizacaoEm: contasBitbrain.ultimaSincronizacaoEm,
      atualizadaEm: contasBitbrain.atualizadaEm,
      atualizadaPorNome: usuarios.nome,
    })
    .from(contasBitbrain)
    .leftJoin(usuarios, eq(usuarios.id, contasBitbrain.atualizadaPor))
    .orderBy(asc(contasBitbrain.nome), asc(contasBitbrain.empresa));
}

/** §4.3: conta nova entra desmarcada; a que sumiu fica indisponível, nunca apagada (D2); a que voltou fica disponível. */
export async function atualizarContasBitbrain(
  db: DbOuTx,
  empresas: EmpresaBitbrain[],
  agora: Date,
): Promise<{ total: number; novas: number; indisponiveis: number }> {
  return db.transaction(async (tx) => {
    const antes = new Set((await tx.select({ empresa: contasBitbrain.empresa }).from(contasBitbrain)).map((c) => c.empresa));
    for (const e of empresas) {
      await tx
        .insert(contasBitbrain)
        .values({ empresa: e.empresa, nome: e.nome, sellerId: e.sellerId, disponivel: true, atualizadaEm: agora })
        .onConflictDoUpdate({ target: contasBitbrain.empresa, set: { nome: e.nome, sellerId: e.sellerId, disponivel: true } });
    }
    const presentes = empresas.map((e) => e.empresa);
    const sumiram = await tx
      .update(contasBitbrain)
      .set({ disponivel: false })
      .where(and(eq(contasBitbrain.disponivel, true), presentes.length > 0 ? notInArray(contasBitbrain.empresa, presentes) : undefined))
      .returning({ empresa: contasBitbrain.empresa });
    return { total: empresas.length, novas: presentes.filter((p) => !antes.has(p)).length, indisponiveis: sumiram.length };
  });
}

/** "Atualizar contas" e a abertura da tela (D13). Erro do Bitbrain ou da rede lança: quem chama mostra a mensagem. */
export async function buscarEAtualizarContas(db: DbOuTx, config: ConfigML, agora: Date, timeoutMs: number = TIMEOUT_EMPRESAS_MS) {
  const empresas = await listarEmpresasBitbrain({ url: config.bitbrainUrl, token: config.bitbrainToken, fetchFn: fetchDoBitbrain(config), timeoutMs });
  return atualizarContasBitbrain(db, empresas, agora);
}

/** Texto para a tela. Nunca traz o token (o ErroBitbrain não o conhece). */
export function mensagemFalhaBitbrain(erro: unknown): string {
  if (erro instanceof ErroBitbrain) return erro.message;
  return 'O Bitbrain não respondeu agora. Toque em "Atualizar contas" em alguns minutos.';
}

/** Só o Gestor marca; cada mudança gera evento (§4.3). Marcar o que já está marcado não muda nada. */
export async function marcarContaBitbrain(db: DbOuTx, p: { empresa: string; recebe: boolean }, usuario: UsuarioSessao, agora: Date): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContaBitbrain('Só o Gestor escolhe as contas que mandam devoluções.');
  await db.transaction(async (tx) => {
    const [mudou] = await tx
      .update(contasBitbrain)
      .set({ recebeDevolucoes: p.recebe, atualizadaEm: agora, atualizadaPor: usuario.id })
      .where(and(eq(contasBitbrain.empresa, p.empresa), eq(contasBitbrain.recebeDevolucoes, !p.recebe)))
      .returning({ empresa: contasBitbrain.empresa });
    if (!mudou) {
      const [existe] = await tx.select({ empresa: contasBitbrain.empresa }).from(contasBitbrain).where(eq(contasBitbrain.empresa, p.empresa));
      if (!existe) throw new ErroContaBitbrain('Conta não encontrada. Toque em "Atualizar contas".');
      return;
    }
    await registrarEvento(tx, {
      entidade: 'conta_bitbrain',
      entidadeId: p.empresa,
      acao: p.recebe ? 'ml_conta_bitbrain_marcada' : 'ml_conta_bitbrain_desmarcada',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

export async function contasParaVarrer(db: DbOuTx): Promise<{ empresa: string; ultimaSincronizacaoEm: Date | null }[]> {
  return db
    .select({ empresa: contasBitbrain.empresa, ultimaSincronizacaoEm: contasBitbrain.ultimaSincronizacaoEm })
    .from(contasBitbrain)
    .where(and(eq(contasBitbrain.recebeDevolucoes, true), eq(contasBitbrain.disponivel, true)))
    .orderBy(asc(contasBitbrain.empresa));
}

export async function marcarSincronizacaoBitbrain(db: DbOuTx, empresa: string, agora: Date): Promise<void> {
  await db.update(contasBitbrain).set({ ultimaSincronizacaoEm: agora }).where(eq(contasBitbrain.empresa, empresa));
}

export async function marcarContaIndisponivel(db: DbOuTx, empresa: string): Promise<void> {
  await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, empresa));
}

/** Alerta de sincronização parada (spec §11) por conta marcada: desde a última varredura, ou desde que foi marcada. */
export function contaAtrasada(
  c: Pick<ContaBitbrain, 'recebeDevolucoes' | 'disponivel' | 'ultimaSincronizacaoEm' | 'atualizadaEm'>,
  agora: Date,
): boolean {
  return c.recebeDevolucoes && c.disponivel && sincronizacaoAtrasada(c.ultimaSincronizacaoEm ?? c.atualizadaEm, agora);
}

/** "Conta indisponível no Bitbrain: a varredura pula essa conta e avisa no Painel" (§5): só as marcadas. */
export async function contarContasIndisponiveis(db: DbOuTx): Promise<number> {
  const [linha] = await db
    .select({ total: count() })
    .from(contasBitbrain)
    .where(and(eq(contasBitbrain.recebeDevolucoes, true), eq(contasBitbrain.disponivel, false)));
  return Number(linha?.total ?? 0);
}
