import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, notasVenda } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { capacidade, casarItens, chaveAlvo, type AlvoCasamento } from './casamento';
import { ErroFiscal } from './erros';
import { carregarDadosDevolucao } from './montar-devolucao';
import { temNotaEmAndamento } from './nota-venda';

/**
 * D14: o Fiscal liga uma unidade a um item da NF de venda (ou desfaz, com `alvo` null). A escolha fica no jsonb
 * `notas_venda.itens[].itensDevolucaoIds` (decisão 6) e respeita a quantidade vendida.
 */
export async function escolherItemNotaVenda(db: Db, devolucaoId: string, itemId: string, alvo: AlvoCasamento | null, usuario: UsuarioSessao): Promise<void> {
  if (!pode(usuario.perfil, 'gerir_fiscal')) throw new ErroFiscal('Só o Fiscal ou o Gestor escolhem o item da NF de venda.');
  await db.transaction(async (tx) => {
    const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId)).for('update');
    if (!d) throw new ErroFiscal('Devolução não encontrada.');
    if (d.status !== 'AGUARDANDO_NF') throw new ErroFiscal('O item da NF de venda só é escolhido com a devolução em Aguardando NF.');
    if (await temNotaEmAndamento(tx, devolucaoId)) throw new ErroFiscal('Esta devolução já tem NF de devolução em processamento ou autorizada.');
    const dados = await carregarDadosDevolucao(tx, devolucaoId);
    const unidade = dados?.unidades.find((u) => u.itemId === itemId);
    if (!dados || !unidade) throw new ErroFiscal('Unidade não encontrada ou fora de Aguardando NF.');

    // Tira a unidade de qualquer escolha anterior.
    const notas = dados.notasVenda.map((n) => ({
      ...n,
      itens: n.itens.map((i) => ({ ...i, itensDevolucaoIds: i.itensDevolucaoIds.filter((id) => id !== itemId) })),
    }));
    if (alvo) {
      const item = notas.find((n) => n.notaVendaId === alvo.notaVendaId)?.itens.find((i) => i.numero === alvo.numeroItem);
      if (!item) throw new ErroFiscal('Item da NF de venda não encontrado.');
      const outras = casarItens(
        dados.unidades.filter((u) => u.itemId !== itemId),
        notas,
      );
      const ocupadas = outras.filter((c) => c.alvo && chaveAlvo(c.alvo) === chaveAlvo(alvo)).length;
      if (ocupadas >= capacidade(item.quantidade)) {
        throw new ErroFiscal(`O item ${item.numero} da NF de venda (${item.codigo}) já tem todas as unidades ligadas (${capacidade(item.quantidade)}).`);
      }
      item.itensDevolucaoIds = [...item.itensDevolucaoIds, itemId];
    }
    for (const n of notas) await tx.update(notasVenda).set({ itens: n.itens }).where(eq(notasVenda.id, n.notaVendaId));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'nf_item_escolhido',
      usuarioId: usuario.id,
      dados: { itemId, unidade: unidade.unidade, notaVendaId: alvo?.notaVendaId ?? null, numeroItem: alvo?.numeroItem ?? null },
    });
  });
}
