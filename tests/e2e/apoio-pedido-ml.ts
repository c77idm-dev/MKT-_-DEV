/**
 * (extra, emenda E27) Apoio dos e2e da ficha da venda no Receber pacote, no Conferir pacote e na Retirada do Full:
 * devoluções do ML com o mesmo pedido, a venda gravada em vendas_ml e o status lido do banco.
 */
import { eq, inArray } from 'drizzle-orm';
import { devolucoes, vendasMl } from '../../src/db/schema';
import type { StatusDevolucao } from '../../src/modules/devolucoes/dominio';
import { criarDevolucaoTeste, criarProdutoTeste } from '../helpers/fabricas';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

function digitos(n: number): string {
  return String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
}

/** Pedido do ML: 16 dígitos começando por 2, único na execução (o banco do e2e é o mesmo nos dois projetos). */
export function pedidoML(): string {
  return `2${String(Date.now()).padStart(13, '0')}${digitos(2)}`;
}

export type DevolucaoDoPedido = { id: string; codigo: string; produto: string };

/**
 * Devoluções do ML com o mesmo pedido, uma por status, cada uma com um produto cadastrado próprio (descrição única).
 * A criação manual recusa um 2º pedido em andamento no mesmo canal; pela API cada devolução externa do pedido vira uma.
 * Aqui o pedido é trocado direto no banco.
 */
export async function devolucoesDoPedido(pedido: string, status: StatusDevolucao[]): Promise<DevolucaoDoPedido[]> {
  return comBanco(async (db) => {
    const operador = await usuarioPorEmail(db, USUARIOS_E2E.operador.email);
    const criadas: DevolucaoDoPedido[] = [];
    for (const [i, s] of status.entries()) {
      const sku = codigoUnico(`FV${i}`);
      const produto = `Produto ${i + 1} do pedido ${pedido.slice(-4)}`;
      await criarProdutoTeste(db, { sku, descricao: produto });
      const d = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: `${pedido}-${i}`, itens: [{ sku, quantidade: 1 }] });
      await db.update(devolucoes).set({ pedidosExternos: [pedido], status: s }).where(eq(devolucoes.id, d.id));
      criadas.push({ id: d.id, codigo: d.codigo, produto });
    }
    return criadas;
  });
}

/** A venda do pedido como a sincronização grava (um item, sem dados do comprador). */
export async function gravarVenda(pedido: string, item: { titulo: string; sku: string; valor: number }): Promise<void> {
  await comBanco((db) =>
    db.insert(vendasMl).values({
      pedidoId: pedido,
      conta: null,
      vendidaEm: new Date('2026-11-20T12:00:00Z'),
      situacao: 'paid',
      situacaoEnvio: 'delivered',
      itens: [{ anuncioId: 'MLB123', titulo: item.titulo, sku: item.sku, variacaoId: null, quantidade: 1, valorUnitario: item.valor }],
      atualizadaEm: new Date(),
    }),
  );
}

/** O status de cada devolução, na ordem dos códigos. */
export async function statusDas(codigos: string[]): Promise<StatusDevolucao[]> {
  const linhas = await comBanco((db) => db.select({ codigo: devolucoes.codigo, status: devolucoes.status }).from(devolucoes).where(inArray(devolucoes.codigo, codigos)));
  return codigos.map((c) => linhas.find((l) => l.codigo === c)?.status ?? ('?' as StatusDevolucao));
}
