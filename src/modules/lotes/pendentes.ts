import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { devolucoes, itensDevolucao, produtos } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { normalizarSku } from '@/modules/catalogo/documentos';
import { alocarItensProblema, incluirNoLote } from './alocacao';
import { ErroLotes } from './erros';
import { exigirPodeGerirLotes } from './repositorio';

const TAREFA = 'lotes.alocar-pendentes';

/**
 * Spec §5.3: o Fiscal/Gestor informa o SKU do produto realmente recebido e a unidade SEM_FORNECEDOR entra no lote ABERTO do fornecedor dele.
 * Ordem das travas (a mesma do cancelamento da NF e de `alocarPendentes`): primeiro a devolução, depois a unidade.
 */
export async function associarProduto(
  db: Db,
  itemId: string,
  sku: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<{ loteCodigo: string; unidade: number; devolucaoCodigo: string }> {
  exigirPodeGerirLotes(usuario);
  const [previa] = await db.select({ devolucaoId: itensDevolucao.devolucaoId }).from(itensDevolucao).where(eq(itensDevolucao.id, itemId));
  if (!previa) throw new ErroLotes('Esta unidade não está mais sem fornecedor.');

  return db.transaction(async (tx) => {
    const [devolucao] = await tx
      .select({ id: devolucoes.id, codigo: devolucoes.codigo })
      .from(devolucoes)
      .where(eq(devolucoes.id, previa.devolucaoId))
      .for('update');
    const [item] = await tx
      .select({ id: itensDevolucao.id, unidade: itensDevolucao.unidade, status: itensDevolucao.status })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.id, itemId))
      .for('update');
    if (!devolucao || !item || item.status !== 'SEM_FORNECEDOR') throw new ErroLotes('Esta unidade não está mais sem fornecedor.');

    const skuNormalizado = normalizarSku(sku);
    const [produto] = await tx
      .select({ id: produtos.id, sku: produtos.sku, fornecedorId: produtos.fornecedorId })
      .from(produtos)
      .where(eq(produtos.sku, skuNormalizado));
    if (!produto) throw new ErroLotes(`O SKU ${skuNormalizado} não está no cadastro: cadastre o produto em Produtos e Fornecedores.`);
    if (!produto.fornecedorId) {
      throw new ErroLotes(`O produto ${produto.sku} não tem fornecedor: escolha o fornecedor dele em Produtos e Fornecedores.`);
    }

    await tx.update(itensDevolucao).set({ produtoRecebidoId: produto.id }).where(eq(itensDevolucao.id, itemId));
    const { loteCodigo } = await incluirNoLote(tx, {
      itemId,
      unidade: item.unidade,
      devolucaoId: devolucao.id,
      de: 'SEM_FORNECEDOR',
      fornecedorId: produto.fornecedorId,
      ator: usuario.perfil,
      usuarioId: usuario.id,
      agora,
      produtoRecebidoId: produto.id,
    });
    return { loteCodigo, unidade: item.unidade, devolucaoCodigo: devolucao.codigo };
  });
}

export type OpcoesAlocarPendentes = {
  registrar?: (linha: Record<string, unknown>) => void;
  /** Só para o teste simular uma falha numa devolução. */
  antesDeCada?: (devolucaoId: string) => void;
};

/**
 * Tarefa `lotes.alocar-pendentes` (uma vez, na subida do worker). Idempotente.
 * (a) devoluções CONCLUIDA com unidade PROBLEMA ainda em AGUARDANDO_NF (o que a porta "sem lotes" da Fase 4 deixou, D11);
 * (b) unidades SEM_FORNECEDOR cujo produto recebido ganhou fornecedor no cadastro.
 * Um produto que ganha fornecedor no cadastro entra no lote na próxima subida do worker, ou na hora pelo "Associar produto".
 * Cada devolução tem a sua transação e o seu try/catch: o erro vai para o log estruturado (spec §11) e a varredura segue (decisão 12).
 */
export async function alocarPendentes(
  db: Db,
  agora: Date,
  opcoes: OpcoesAlocarPendentes = {},
): Promise<{ alocadas: number; semFornecedor: number; falhas: number }> {
  const registrar = opcoes.registrar ?? ((linha: Record<string, unknown>) => console.error(JSON.stringify(linha)));

  const doPassoA = await db
    .selectDistinct({ id: itensDevolucao.devolucaoId })
    .from(itensDevolucao)
    .innerJoin(devolucoes, eq(devolucoes.id, itensDevolucao.devolucaoId))
    .where(and(eq(devolucoes.status, 'CONCLUIDA'), eq(itensDevolucao.status, 'AGUARDANDO_NF'), eq(itensDevolucao.destino, 'PROBLEMA')));
  const doPassoB = await db
    .selectDistinct({ id: itensDevolucao.devolucaoId })
    .from(itensDevolucao)
    .innerJoin(produtos, eq(produtos.id, itensDevolucao.produtoRecebidoId))
    .where(and(eq(itensDevolucao.status, 'SEM_FORNECEDOR'), isNotNull(produtos.fornecedorId)));
  const ids = [...new Set([...doPassoA, ...doPassoB].map((l) => l.id))].sort();

  const total = { alocadas: 0, semFornecedor: 0, falhas: 0 };
  for (const devolucaoId of ids) {
    try {
      opcoes.antesDeCada?.(devolucaoId);
      const r = await db.transaction(async (tx) => {
        const [devolucao] = await tx
          .select({ status: devolucoes.status })
          .from(devolucoes)
          .where(eq(devolucoes.id, devolucaoId))
          .for('update');
        const parcial = { alocadas: 0, semFornecedor: 0 };
        if (!devolucao) return parcial;
        // (a) com a devolução travada, confere que continua CONCLUIDA.
        if (devolucao.status === 'CONCLUIDA') {
          const a = await alocarItensProblema(tx, devolucaoId, agora);
          parcial.alocadas += a.alocadas;
          parcial.semFornecedor += a.semFornecedor;
        }
        // (b) depois da devolução, as unidades (mesma ordem de travas do associarProduto).
        const prontas = await tx
          .select({
            id: itensDevolucao.id,
            unidade: itensDevolucao.unidade,
            fornecedorId: produtos.fornecedorId,
          })
          .from(itensDevolucao)
          .innerJoin(produtos, eq(produtos.id, itensDevolucao.produtoRecebidoId))
          .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'SEM_FORNECEDOR'), isNotNull(produtos.fornecedorId)))
          .orderBy(asc(itensDevolucao.unidade))
          .for('update', { of: itensDevolucao });
        for (const u of prontas) {
          if (!u.fornecedorId) continue;
          await incluirNoLote(tx, {
            itemId: u.id,
            unidade: u.unidade,
            devolucaoId,
            de: 'SEM_FORNECEDOR',
            fornecedorId: u.fornecedorId,
            ator: 'SISTEMA',
            usuarioId: null,
            agora,
          });
          parcial.alocadas += 1;
        }
        return parcial;
      });
      total.alocadas += r.alocadas;
      total.semFornecedor += r.semFornecedor;
    } catch (erro) {
      total.falhas += 1;
      registrar({
        nivel: 'erro',
        tarefa: TAREFA,
        devolucaoId,
        mensagem: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }
  return total;
}
