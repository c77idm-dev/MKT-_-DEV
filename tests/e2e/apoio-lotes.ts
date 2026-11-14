import { eq } from 'drizzle-orm';
import { devolucoes } from '@/db/schema';
import { alocarItensProblema } from '@/modules/lotes/alocacao';
import type { StatusLote } from '@/modules/lotes/dominio';
import type { MotivoProblemaTeste } from '../helpers/fabricas-fiscal';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste, criarProdutoDoFornecedorTeste } from '../helpers/fabricas-lotes';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/**
 * Lote no status pedido, com `unidades` unidades PROBLEMA de uma devolução, gravado direto no banco. Fornecedor, SKU, S/N
 * e razão social são únicos por execução (o banco do e2e é o mesmo para o computador e o celular).
 */
export async function prepararLote(
  p: { status?: StatusLote; unidades?: number; motivo?: MotivoProblemaTeste } = {},
): Promise<{ loteId: string; codigo: string; fornecedor: string; devolucaoCodigo: string; sku: string; itemIds: string[] }> {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const fornecedor = await criarFornecedorCompletoTeste(db, { razaoSocial: codigoUnico('Fornecedor E2E') });
    const sku = codigoUnico('LOTE');
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj, sku });
    const quantidade = p.unidades ?? 1;
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: Array.from({ length: quantidade }, () => ({ destino: 'PROBLEMA' as const, motivo: p.motivo, serial: codigoUnico('SN'), produtoId: produto.id })),
    });
    const itemIds = dev.itens.map((i) => i.id);
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: p.status ?? 'ABERTO', itemIds });
    return { loteId: lote.id, codigo: lote.codigo, fornecedor: fornecedor.razaoSocial, devolucaoCodigo: dev.codigo, sku, itemIds };
  });
}

/**
 * Devolução CONCLUIDA com uma unidade PROBLEMA em SEM_FORNECEDOR (produto recebido desconhecido) e, à parte, um produto
 * com fornecedor no cadastro: o Fiscal informa o SKU dele em "Associar produto".
 */
export async function prepararSemFornecedor(): Promise<{ devolucaoCodigo: string; skuParaAssociar: string }> {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ sku: codigoUnico('SEMF'), destino: 'PROBLEMA', serial: codigoUnico('SN'), produtoId: null }],
    });
    const agora = new Date();
    await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: agora }).where(eq(devolucoes.id, dev.id));
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, agora));
    const fornecedor = await criarFornecedorCompletoTeste(db, { razaoSocial: codigoUnico('Fornecedor E2E') });
    const skuParaAssociar = codigoUnico('ASSOC');
    await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj, sku: skuParaAssociar });
    return { devolucaoCodigo: dev.codigo, skuParaAssociar };
  });
}
