import { count, eq } from 'drizzle-orm';
import type { Db, DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, usuarios } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { rotuloStatus } from '@/modules/devolucoes/dominio';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { registrarEvento } from '@/modules/historico/eventos';
import { ErroConferencia } from './erros';

/** Lê a devolução travando a linha até o fim da transação: duas pessoas no mesmo pacote esperam uma pela outra. */
export async function travarDevolucao(tx: DbOuTx, devolucaoId: string) {
  const [d] = await tx
    .select({
      id: devolucoes.id,
      codigo: devolucoes.codigo,
      status: devolucoes.status,
      canal: devolucoes.canal,
      naoIdentificada: devolucoes.naoIdentificada,
      conferenteId: devolucoes.conferenteId,
    })
    .from(devolucoes)
    .where(eq(devolucoes.id, devolucaoId))
    .for('update');
  if (!d) throw new ErroConferencia('Devolução não encontrada.');
  return d;
}

async function nomeDoUsuario(tx: DbOuTx, id: string | null): Promise<string> {
  if (!id) return 'outra pessoa';
  const [u] = await tx.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, id));
  return u?.nome ?? 'outra pessoa';
}

/** A conferência está aberta por este usuário. Toda gravação da bancada passa por aqui (trava conferida no servidor). */
export async function exigirConferente(tx: DbOuTx, devolucaoId: string, usuario: UsuarioSessao) {
  const d = await travarDevolucao(tx, devolucaoId);
  if (d.status !== 'EM_CONFERENCIA' || d.conferenteId !== usuario.id) {
    throw new ErroConferencia('A conferência desta devolução não está aberta por você. Abra a devolução de novo.');
  }
  return d;
}

export async function iniciarConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirTransicao({ de: 'AGUARDANDO_CONFERENCIA', para: 'EM_CONFERENCIA', ator: usuario.perfil }, 'Seu perfil não pode conferir devoluções.');
  await db.transaction(async (tx) => {
    const d = await travarDevolucao(tx, devolucaoId);
    if (d.status === 'EM_CONFERENCIA') {
      if (d.conferenteId === usuario.id) return; // já é dele: só continua
      throw new ErroConferencia(`Em conferência por ${await nomeDoUsuario(tx, d.conferenteId)}.`);
    }
    if (d.status !== 'AGUARDANDO_CONFERENCIA') {
      throw new ErroConferencia(`A devolução ${d.codigo} está ${rotuloStatus(d.status).toLowerCase()}: não dá para conferir.`);
    }
    if (d.naoIdentificada) {
      throw new ErroConferencia('Pacote não identificado: o Gestor identifica o pedido antes da conferência.');
    }
    const [{ unidades }] = await tx.select({ unidades: count() }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId));
    if (unidades === 0) throw new ErroConferencia('A devolução não tem unidades para conferir.');
    await tx
      .update(devolucoes)
      .set({ status: 'EM_CONFERENCIA', conferenteId: usuario.id, conferenciaIniciadaEm: agora, atualizadaEm: agora })
      .where(eq(devolucoes.id, devolucaoId));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_iniciada',
      de: 'AGUARDANDO_CONFERENCIA',
      para: 'EM_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

async function voltarParaAguardando(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void> {
  await tx
    .update(devolucoes)
    .set({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, conferenciaIniciadaEm: null, atualizadaEm: agora })
    .where(eq(devolucoes.id, devolucaoId));
}

export async function desistirConferencia(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil }, 'Seu perfil não pode conferir devoluções.');
  await db.transaction(async (tx) => {
    await exigirConferente(tx, devolucaoId, usuario);
    await voltarParaAguardando(tx, devolucaoId, agora);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_interrompida',
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
    });
  });
}

/** Spec §11: o Gestor pode liberar a trava (por exemplo, quando o celular de quem conferia quebrou). */
export async function liberarTrava(db: Db, devolucaoId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (usuario.perfil !== 'GESTOR') throw new ErroConferencia('Só o Gestor libera a trava da conferência.');
  exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_CONFERENCIA', ator: usuario.perfil });
  await db.transaction(async (tx) => {
    const d = await travarDevolucao(tx, devolucaoId);
    if (d.status !== 'EM_CONFERENCIA') throw new ErroConferencia('Esta devolução não está em conferência.');
    const conferente = await nomeDoUsuario(tx, d.conferenteId);
    await voltarParaAguardando(tx, devolucaoId, agora);
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_trava_liberada',
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioId: usuario.id,
      em: agora,
      dados: { conferenteId: d.conferenteId, conferente },
    });
  });
}
