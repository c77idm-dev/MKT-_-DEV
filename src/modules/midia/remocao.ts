import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, evidencias } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { armazenamentoDoProvedor } from './armazenamento';
import { apagarTemporario } from './temporarios';

/** Recusa da remoção: a mensagem vai direto para a tela. */
export class ErroRemocao extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroRemocao';
    this.status = status;
  }
}

/**
 * Melhoria 2: remove uma foto da avaria (EXTRA). Mesmas regras do envio: só durante a conferência e só quem está com
 * a trava. Fotos 1 a 4 e o Vídeo de Prova não saem por aqui (eles são refeitos, nunca removidos). Apaga a linha, o
 * arquivo e registra evidencia_removida com o hash, para o histórico guardar o que existiu.
 */
export async function removerFotoAvaria(db: Db, evidenciaId: string, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (!pode(usuario.perfil, 'operar_devolucoes')) throw new ErroRemocao(403, 'Seu perfil não remove evidências.');
  if (!ehUuid(evidenciaId)) throw new ErroRemocao(404, 'Foto não encontrada.');

  const apagar = await db.transaction(async (tx) => {
    const [e] = await tx.select().from(evidencias).where(eq(evidencias.id, evidenciaId));
    if (!e) throw new ErroRemocao(404, 'Foto não encontrada.');
    // Trava a devolução, como no envio: remoção e envio da mesma devolução esperam um pelo outro.
    const [d] = await tx
      .select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId })
      .from(devolucoes)
      .where(eq(devolucoes.id, e.devolucaoId))
      .for('update');
    if (e.tipo !== 'EXTRA') throw new ErroRemocao(400, 'Só as fotos da avaria podem ser removidas.');
    if (!d || d.status !== 'EM_CONFERENCIA' || d.conferenteId !== usuario.id) {
      throw new ErroRemocao(409, 'A conferência desta devolução não está aberta por você.');
    }
    // A linha devolvida pelo DELETE é a de agora: o worker pode ter marcado PRONTA (com o arquivo final) depois da
    // leitura acima, enquanto a remoção esperava a trava. Limpeza e evento usam esta, não a lida antes.
    const [apagada] = await tx.delete(evidencias).where(eq(evidencias.id, e.id)).returning();
    if (!apagada) throw new ErroRemocao(404, 'Foto não encontrada.');
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: apagada.devolucaoId,
      acao: 'evidencia_removida',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        evidenciaId: apagada.id,
        tipo: apagada.tipo,
        itemId: apagada.itemId,
        sha256_original: apagada.sha256Original,
        sha256_final: apagada.sha256Final,
      },
    });
    return { caminho: apagada.caminho, provedor: apagada.provedor, temporario: apagada.caminhoTemporario };
  });

  if (apagar.caminho && apagar.provedor) await armazenamentoDoProvedor(apagar.provedor).apagar(apagar.caminho).catch(() => undefined);
  if (apagar.temporario) await apagarTemporario(apagar.temporario);
}
