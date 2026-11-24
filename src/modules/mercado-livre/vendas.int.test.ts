/**
 * Ficha da venda (extra, emenda E27): a sincronização grava em vendas_ml, na mesma transação da reclamação, o básico de
 * cada pedido lido. Regra da D8 no conflito: o que veio vazio não apaga o que já havia.
 */
import { eq, sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFalsoML, idReclamacaoFalsa, idsDaReclamacaoFalsa } from '@/conectores/marketplace/mercadolivre/falso';
import type { VendaML } from '@/conectores/marketplace/mercadolivre/tipos';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { vendasMl } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { configMLTeste, contaMLTeste, dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { criarConectorMLDaConta } from './fabrica-conector';
import { aplicarReclamacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-24T15:00:00Z');
const DEPOIS = new Date('2026-11-24T16:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

const venda = async (pedidoId: string) => (await db.select().from(vendasMl).where(eq(vendasMl.pedidoId, pedidoId)))[0];

function vendaTeste(pedidoId: string, m: Partial<VendaML> = {}): VendaML {
  return {
    pedidoId,
    vendidaEm: new Date('2026-10-28T12:00:00Z'),
    situacao: 'paid',
    situacaoEnvio: 'delivered',
    itens: [{ anuncioId: 'MLB1', titulo: 'Fone de Ouvido', sku: 'FONE-01', variacaoId: null, quantidade: 1, valorUnitario: 129.9 }],
    ...m,
  };
}

/** Uma devolução do ML do pedido, com a venda lida. */
function reclamacaoDoPedido(pedido: string, vendas: VendaML[], m: Parameters<typeof devolucaoExternaTeste>[0] = {}) {
  const d = devolucaoExternaTeste({ pedidos: [pedido], itens: [{ pedido, sku: 'FONE-01', ean: null, quantidade: 1 }], ...m });
  return dadosDevolucaoMLTeste(d, { vendas });
}

describe('vendas_ml na sincronização (E27)', () => {
  it('grava a venda do pedido junto com a reclamação, com a conta do Bitbrain', async () => {
    const dados = reclamacaoDoPedido('2000000000000001', [vendaTeste('2000000000000001')]);
    await aplicarReclamacao(db, dados, AGORA, undefined, 'loja-falsa-1');
    expect(await venda('2000000000000001')).toEqual({
      pedidoId: '2000000000000001',
      conta: 'loja-falsa-1',
      vendidaEm: new Date('2026-10-28T12:00:00Z'),
      situacao: 'paid',
      situacaoEnvio: 'delivered',
      itens: [{ anuncioId: 'MLB1', titulo: 'Fone de Ouvido', sku: 'FONE-01', variacaoId: null, quantidade: 1, valorUnitario: 129.9 }],
      atualizadaEm: AGORA,
    });
  });

  it('D8: a leitura que veio vazia (nulos e lista sem itens) não apaga o que já havia; a data de atualização anda', async () => {
    const pedido = '2000000000000002';
    const d = devolucaoExternaTeste({ pedidos: [pedido] });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { vendas: [vendaTeste(pedido)] }), AGORA, undefined, 'loja-falsa-1');
    const vazia = vendaTeste(pedido, { vendidaEm: null, situacao: null, situacaoEnvio: null, itens: [] });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { vendas: [vazia] }), DEPOIS);
    expect(await venda(pedido)).toMatchObject({
      conta: 'loja-falsa-1',
      vendidaEm: new Date('2026-10-28T12:00:00Z'),
      situacao: 'paid',
      situacaoEnvio: 'delivered',
      itens: [expect.objectContaining({ sku: 'FONE-01', valorUnitario: 129.9 })],
      atualizadaEm: DEPOIS,
    });
  });

  it('o que veio preenchido acompanha o ML: situação nova e itens novos trocam os antigos', async () => {
    const pedido = '2000000000000003';
    const d = devolucaoExternaTeste({ pedidos: [pedido] });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { vendas: [vendaTeste(pedido)] }), AGORA);
    const nova = vendaTeste(pedido, {
      situacao: 'partially_refunded',
      situacaoEnvio: 'not_delivered',
      itens: [{ anuncioId: 'MLB2', titulo: 'Cabo USB-C', sku: 'CABO-02', variacaoId: '77', quantidade: 2, valorUnitario: 10.5 }],
    });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { vendas: [nova] }), DEPOIS);
    expect(await venda(pedido)).toMatchObject({
      situacao: 'partially_refunded',
      situacaoEnvio: 'not_delivered',
      itens: [{ anuncioId: 'MLB2', titulo: 'Cabo USB-C', sku: 'CABO-02', variacaoId: '77', quantidade: 2, valorUnitario: 10.5 }],
    });
  });

  it('duas devoluções do mesmo pedido: uma linha só, que a segunda atualiza', async () => {
    const pedido = '2000000000000004';
    await aplicarReclamacao(db, reclamacaoDoPedido(pedido, [vendaTeste(pedido)]), AGORA);
    await aplicarReclamacao(db, reclamacaoDoPedido(pedido, [vendaTeste(pedido, { situacaoEnvio: 'not_delivered' })]), DEPOIS);
    const linhas = await db.select().from(vendasMl);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ pedidoId: pedido, situacaoEnvio: 'not_delivered', atualizadaEm: DEPOIS });
  });

  it('dois pedidos na mesma devolução: uma linha por pedido', async () => {
    const d = devolucaoExternaTeste({ pedidos: ['2000000000000006', '2000000000000005'] });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { vendas: [vendaTeste('2000000000000006'), vendaTeste('2000000000000005')] }), AGORA);
    expect((await db.select({ pedido: vendasMl.pedidoId }).from(vendasMl)).map((v) => v.pedido).sort()).toEqual(['2000000000000005', '2000000000000006']);
  });

  it('só pedidos de devoluções do sistema: low_cost (só consulta) e reclamação sem devolução não gravam venda', async () => {
    const lowCost = devolucaoExternaTeste({ pedidos: ['2000000000000007'], semEnvioFisico: true, rastreio: null });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(lowCost, { vendas: [vendaTeste('2000000000000007')] }), AGORA);
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(null, { vendas: [vendaTeste('2000000000000008')] }), AGORA);
    expect(await db.select().from(vendasMl)).toEqual([]);
  });

  it('sem dados pessoais: a tabela tem só as colunas da ficha', async () => {
    const colunas = await db.execute<{ column_name: string }>(
      sqlDrizzle`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'vendas_ml' order by column_name`,
    );
    expect(colunas.map((c) => c.column_name)).toEqual(['atualizada_em', 'conta', 'itens', 'pedido_id', 'situacao', 'situacao_envio', 'vendida_em']);
  });
});

describe('vendas_ml pelos conectores de verdade sobre os falsos (E27)', () => {
  it('modo api (ML falso): grava a venda sem nada do comprador e sem nenhuma chamada nova ao ML', async () => {
    const config = configMLTeste();
    await contaMLTeste(db, { config });
    const chamadas: string[] = [];
    const gravador: typeof fetch = async (entrada, init) => {
      chamadas.push(new URL(String(entrada)).pathname);
      return fetchFalsoML(entrada, init);
    };
    definirConectorParaTestes('MERCADO_LIVRE', await criarConectorMLDaConta(db, { config, fetchFn: gravador }));
    const reclamacaoId = idReclamacaoFalsa(1);
    const ids = idsDaReclamacaoFalsa(reclamacaoId)!;
    await manipuladoresMercadoLivre['ml.sincronizar-reclamacao']!({ claimId: reclamacaoId }, { db, fila: new FilaMemoria(), agora: AGORA, tentativa: 1 });

    const linha = await venda(ids.pedidos[0]);
    expect(linha).toMatchObject({
      conta: null,
      situacao: 'paid',
      situacaoEnvio: 'delivered',
      itens: [{ anuncioId: ids.itens[0], titulo: 'Fone de Ouvido Bluetooth MLF', sku: 'MLF-FONE-01', variacaoId: null, quantidade: 1, valorUnitario: 129.9 }],
    });
    // O pedido do ML falso traz o comprador (buyer.id 987654321) e o vendedor: nada disso é gravado.
    expect(JSON.stringify(linha)).not.toContain('987654321');
    // As mesmas leituras de antes da ficha: o pedido e o envio da venda já eram lidos.
    const formatos = [
      /^\/post-purchase\/v1\/claims\/\d+$/,
      /^\/post-purchase\/v2\/claims\/\d+\/returns$/,
      /^\/orders\/\d+$/,
      /^\/items\/MLB\d+$/,
      /^\/shipments\/\d+$/,
      /^\/post-purchase\/v1\/claims\/\d+\/affects-reputation$/,
      /^\/post-purchase\/v1\/claims\/reasons\/[A-Z0-9]+$/,
    ];
    expect(chamadas.filter((c) => !formatos.some((f) => f.test(c)))).toEqual([]);
    expect(chamadas.filter((c) => c.startsWith('/orders/'))).toEqual([`/orders/${ids.pedidos[0]}`]);
  });

  it('modo bitbrain (Bitbrain falso): o pedido sem dados pessoais grava a venda com a conta', async () => {
    usarModoBitbrain();
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await manipuladoresMercadoLivre['ml.sincronizar-reclamacao']!(
      { claimId: '5200000001', conta: 'loja-falsa-1' },
      { db, fila: new FilaMemoria(), agora: AGORA, tentativa: 1 },
    );
    const [linha] = await db.select().from(vendasMl);
    expect(linha).toMatchObject({
      conta: 'loja-falsa-1',
      vendidaEm: new Date('2026-10-28T09:00:00.000-03:00'),
      situacao: 'paid',
      situacaoEnvio: 'delivered',
      itens: [expect.objectContaining({ titulo: 'Fone de Ouvido Bluetooth MLF', sku: 'MLF-FONE-01', quantidade: 1, valorUnitario: 129.9 })],
    });
  });
});
