import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, evidencias, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { ErroConclusao, ErroConferencia } from './erros';
import { unidadesDaDevolucao } from './itens';
import { pendenciasDaConclusao } from './regras';
import { exigirConferente } from './trava';

/**
 * Fim da conferência (contrato §5.4). Numa transação: unidades PENDENTE → AGUARDANDO_NF (com destino) ou AUSENTE,
 * devolução → AGUARDANDO_NF com conferida_em e, se todas forem AUSENTE, → CONCLUIDA (pelo sistema) com concluida_em.
 * Devolução do Mercado Livre: enfileira ml.enviar-resultado (o manipulador é da Fase 3).
 */
export async function concluirConferencia(
  db: Db,
  devolucaoId: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ status: 'AGUARDANDO_NF' | 'CONCLUIDA' }> {
  exigirTransicao({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_NF', ator: usuario.perfil }, 'Seu perfil não pode conferir devoluções.');
  return db.transaction(async (tx) => {
    const d = await exigirConferente(tx, devolucaoId, usuario);
    const itens = await unidadesDaDevolucao(tx, devolucaoId);
    if (itens.some((i) => i.status !== 'PENDENTE')) throw new ErroConferencia('Esta conferência já foi concluída.');
    // "Subiu" = existe a linha e o processamento não falhou (contrato §5.4).
    const subiram = await tx
      .select({ tipo: evidencias.tipo, itemId: evidencias.itemId })
      .from(evidencias)
      .where(and(eq(evidencias.devolucaoId, devolucaoId), ne(evidencias.situacaoProcessamento, 'FALHOU')));
    const config = await lerConfiguracao(tx);
    const pendencias = pendenciasDaConclusao({ itens, evidencias: subiram, videoObrigatorio: config.videoObrigatorio });
    if (pendencias.length > 0) throw new ErroConclusao(pendencias);

    for (const item of itens) {
      const para = item.motivo === 'AUSENTE' ? 'AUSENTE' : 'AGUARDANDO_NF';
      exigirTransicaoItem({ de: 'PENDENTE', para, ator: usuario.perfil });
      // Decisão 9: sem leitura de EAN, concluir confirma o produto esperado.
      const confirmarEsperado = para === 'AGUARDANDO_NF' && item.eanLido === null && item.produtoRecebidoId === null;
      await tx
        .update(itensDevolucao)
        .set({ status: para, ...(confirmarEsperado ? { produtoRecebidoId: item.produtoEsperadoId } : {}) })
        .where(eq(itensDevolucao.id, item.id));
      await registrarEvento(tx, {
        entidade: 'item',
        entidadeId: item.id,
        acao: 'item_conferido',
        de: 'PENDENTE',
        para,
        usuarioId: usuario.id,
        em: agora,
        dados: { devolucaoId, unidade: item.unidade, destino: item.destino, motivo: item.motivo },
      });
    }

    await tx.update(devolucoes).set({ status: 'AGUARDANDO_NF', conferidaEm: agora, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'conferencia_concluida',
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_NF',
      usuarioId: usuario.id,
      em: agora,
    });

    let status: 'AGUARDANDO_NF' | 'CONCLUIDA' = 'AGUARDANDO_NF';
    if (itens.every((i) => i.motivo === 'AUSENTE')) {
      // Nenhuma unidade física a dar entrada (spec §5.2): o sistema conclui.
      exigirTransicao({ de: 'AGUARDANDO_NF', para: 'CONCLUIDA', ator: 'SISTEMA' });
      await tx.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: agora, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: devolucaoId,
        acao: 'concluida',
        de: 'AGUARDANDO_NF',
        para: 'CONCLUIDA',
        usuarioId: null,
        em: agora,
        dados: { motivo: 'Todas as unidades estavam ausentes.' },
      });
      status = 'CONCLUIDA';
    }

    if (d.canal === 'MERCADO_LIVRE') {
      await obterFila().enviar('ml.enviar-resultado', { devolucaoId }, { tx, chaveUnica: devolucaoId });
    }
    return { status };
  });
}
