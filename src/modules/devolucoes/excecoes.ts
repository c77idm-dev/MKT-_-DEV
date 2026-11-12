import { and, eq, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { registrarEvento } from '@/modules/historico/eventos';
import { chavePedido, codigosAtivosPorPedido, expandirUnidades, validarNovaDevolucao, type EntradaNovaDevolucao } from './criar';
import { ErroDevolucao } from './erros';
import { exigirTransicao } from './transicoes';

/**
 * Spec §5.2: Pendente de chegada → Cancelada ou Extraviada, por ação manual do Gestor, com motivo no histórico.
 * O UPDATE é condicional ao status: se dois Gestores agem ao mesmo tempo, só um vence e só um evento é gravado.
 */
export async function encerrarPendente(
  db: DbOuTx,
  id: string,
  para: 'CANCELADA' | 'EXTRAVIADA',
  motivoBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<void> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para, ator: usuario.perfil }, 'Só o Gestor cancela ou marca como extraviada uma devolução.');
  const motivo = motivoBruto.trim();
  if (motivo.length < 3) throw new ErroDevolucao('Explique o motivo (pelo menos 3 letras).');
  if (motivo.length > 500) throw new ErroDevolucao('Motivo: no máximo 500 caracteres.');
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  await db.transaction(async (tx) => {
    const [atualizada] = await tx
      .update(devolucoes)
      .set({ status: para, atualizadaEm: agora })
      .where(and(eq(devolucoes.id, id), eq(devolucoes.status, 'PENDENTE_CHEGADA')))
      .returning({ id: devolucoes.id });
    if (!atualizada) {
      const [existe] = await tx.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.id, id)).limit(1);
      if (!existe) throw new ErroDevolucao('Devolução não encontrada.');
      throw new ErroDevolucao('Só dá para cancelar ou marcar como extraviada uma devolução Pendente de chegada.');
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: id,
      acao: para === 'CANCELADA' ? 'cancelada' : 'extraviada',
      de: 'PENDENTE_CHEGADA',
      para,
      usuarioId: usuario.id,
      dados: { motivo },
      em: agora,
    });
  });
}

/**
 * Spec §5.2: depois que o pedido certo é descoberto, o Gestor liga o pacote não identificado a ele e a marca sai.
 * Preenche canal, pedido, reclamação, transportadora e (opcionalmente) os itens. "Juntar duas devoluções" fica para depois.
 * O UPDATE é condicional a `nao_identificada`: se dois Gestores identificam ao mesmo tempo, só um vence.
 */
export async function identificarDevolucao(
  db: DbOuTx,
  id: string,
  entrada: EntradaNovaDevolucao,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroDevolucao('Só o Gestor identifica um pacote não identificado.');
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  const { dados, erros } = validarNovaDevolucao(entrada, { exigirItens: false });
  if (!dados) throw new ErroDevolucao(erros.join('; '));
  // Conferência de pedido duplicado fora da transação: padrão aceito (PF7), a corrida é estreita e o Gestor revê.
  const outra = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(chavePedido(dados.canal, dados.pedido));
  if (outra) {
    throw new ErroDevolucao(`O pedido já tem a devolução ${outra}. Se ela ainda está pendente de chegada, cancele-a e tente de novo.`);
  }
  const unidades = expandirUnidades(dados.itens);
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);

  await db.transaction(async (tx) => {
    const [atualizada] = await tx
      .update(devolucoes)
      .set({
        canal: dados.canal,
        pedidosExternos: [dados.pedido],
        reclamacaoId: dados.reclamacaoId,
        transportadora: dados.transportadora,
        naoIdentificada: false,
        atualizadaEm: agora,
      })
      .where(and(eq(devolucoes.id, id), eq(devolucoes.naoIdentificada, true)))
      .returning({ id: devolucoes.id });
    if (!atualizada) {
      const [existe] = await tx.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.id, id)).limit(1);
      if (!existe) throw new ErroDevolucao('Devolução não encontrada.');
      throw new ErroDevolucao('Esta devolução já foi identificada.');
    }
    if (unidades.length > 0) {
      const [{ maior }] = await tx
        .select({ maior: sql<number>`coalesce(max(${itensDevolucao.unidade}), 0)::int` })
        .from(itensDevolucao)
        .where(eq(itensDevolucao.devolucaoId, id));
      await tx.insert(itensDevolucao).values(
        unidades.map((sku, i) => ({ devolucaoId: id, unidade: maior + i + 1, sku, produtoEsperadoId: produtosPorSku.get(sku) ?? null })),
      );
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: id,
      acao: 'identificada',
      usuarioId: usuario.id,
      dados: { canal: dados.canal, pedido: dados.pedido, unidades: unidades.length },
      em: agora,
    });
  });
}
