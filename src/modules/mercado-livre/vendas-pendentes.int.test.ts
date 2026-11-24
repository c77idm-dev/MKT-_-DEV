/**
 * Ficha da venda (extra, emenda E27): as devoluções que já existiam antes da ficha. A cada varredura (15 min), um passo
 * pede de novo, aos poucos, a leitura das reclamações ligadas a devoluções cujo pedido ainda não tem linha em vendas_ml.
 */
import { eq, isNull } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contasBitbrain, devolucoes, reclamacoesMl, vendasMl } from '@/db/schema';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { FilaMemoria } from '@/modules/fila/fila';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { ConectorMLMemoria, contaMLTeste, dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { chaveTarefaReclamacao } from './notificacoes';
import { aplicarReclamacao } from './sincronizar';
import { ESPERA_LOTE_MS, INTERVALO_LEITURAS_MS, NOVA_TENTATIVA_MS, pedirVendasQueFaltam, RECLAMACOES_POR_RODADA } from './vendas-pendentes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-24T15:00:00Z');
let fila: FilaMemoria;
let sequencia = 0;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', new ConectorMLMemoria());
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

/** Uma devolução do ML sincronizada antes da ficha: reclamação ligada e nenhuma linha em vendas_ml. */
async function devolucaoAntiga(p: { conta?: string | null; status?: StatusDevolucao; pedidos?: string[] } = {}) {
  sequencia += 1;
  const pedidos = p.pedidos ?? [`200000000${String(sequencia).padStart(7, '0')}`];
  const d = devolucaoExternaTeste({ reclamacaoId: `5${String(sequencia).padStart(9, '0')}`, pedidos });
  const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA, undefined, p.conta ?? null);
  if (!('devolucaoId' in r)) throw new Error('a devolução não foi criada');
  if (p.status) await db.update(devolucoes).set({ status: p.status }).where(eq(devolucoes.id, r.devolucaoId));
  return { claimId: d.reclamacaoId, devolucaoId: r.devolucaoId, pedidos };
}

const pedidas = () => fila.enviadas.filter((e) => e.nome === 'ml.sincronizar-reclamacao');
const depois = (ms: number) => new Date(AGORA.getTime() + ms);
const MINUTO = 60_000;

/** As leituras pedidas rodaram e o ML mandou a venda: as linhas vazias ganham dados (no horário marcado). */
async function lerAsPedidas() {
  await db.update(vendasMl).set({ situacao: 'paid' });
}

describe('pedirVendasQueFaltam: modo api (uma conta do ML)', () => {
  beforeEach(async () => {
    await contaMLTeste(db);
  });

  it('pede a leitura das reclamações ligadas a devoluções sem a venda, espaçadas, com a chave da sincronização', async () => {
    const a = await devolucaoAntiga();
    const b = await devolucaoAntiga();
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 2 });
    expect(pedidas().map((e) => [e.dados, e.opcoes?.iniciarEm, e.opcoes?.chaveUnica])).toEqual([
      [{ claimId: a.claimId }, AGORA, chaveTarefaReclamacao(a.claimId, AGORA)],
      [{ claimId: b.claimId }, new Date(AGORA.getTime() + INTERVALO_LEITURAS_MS), chaveTarefaReclamacao(b.claimId, AGORA)],
    ]);
  });

  it('o pedido pedido ganha uma linha vazia em vendas_ml (não volta a ser pedido); a leitura depois preenche (D8)', async () => {
    const a = await devolucaoAntiga({ conta: null });
    await pedirVendasQueFaltam(db, fila, AGORA);
    expect(await db.select().from(vendasMl)).toEqual([
      { pedidoId: a.pedidos[0], conta: null, vendidaEm: null, situacao: null, situacaoEnvio: null, itens: [], atualizadaEm: AGORA },
    ]);
    const d = devolucaoExternaTeste({ reclamacaoId: a.claimId, pedidos: a.pedidos });
    const [devolucao] = await db.select({ externa: devolucoes.devolucaoExternaId }).from(devolucoes).where(eq(devolucoes.id, a.devolucaoId));
    const venda = { pedidoId: a.pedidos[0], vendidaEm: null, situacao: 'paid', situacaoEnvio: 'delivered', itens: [] };
    await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, devolucaoExternaId: devolucao.externa! }, { vendas: [venda] }), AGORA);
    expect(await db.select({ situacao: vendasMl.situacao, envio: vendasMl.situacaoEnvio }).from(vendasMl)).toEqual([{ situacao: 'paid', envio: 'delivered' }]);
  });

  it(`poucas por vez (${RECLAMACOES_POR_RODADA} por rodada) e para sozinho quando não sobra nenhuma`, async () => {
    for (let i = 0; i < RECLAMACOES_POR_RODADA + 3; i += 1) await devolucaoAntiga();
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: RECLAMACOES_POR_RODADA });
    const ultima = pedidas().at(-1)?.opcoes?.iniciarEm;
    expect(ultima).toEqual(new Date(AGORA.getTime() + (RECLAMACOES_POR_RODADA - 1) * INTERVALO_LEITURAS_MS));
    // A rodada inteira cabe antes da próxima varredura (15 min).
    expect((ultima?.getTime() ?? 0) - AGORA.getTime()).toBeLessThan(15 * MINUTO);
    await lerAsPedidas();
    expect(await pedirVendasQueFaltam(db, fila, depois(15 * MINUTO))).toEqual({ pedidas: 3 });
    await lerAsPedidas();
    expect(await pedirVendasQueFaltam(db, fila, depois(30 * MINUTO))).toEqual({ pedidas: 0 });
    expect(new Set(pedidas().map((e) => (e.dados as { claimId: string }).claimId)).size).toBe(RECLAMACOES_POR_RODADA + 3);
  });

  it('deixa de fora: pedido que já tem venda, devolução de outro canal, reclamação sem devolução e pedido que não é número', async () => {
    const comVenda = await devolucaoAntiga();
    await db.insert(vendasMl).values({ pedidoId: comVenda.pedidos[0], situacao: 'paid', atualizadaEm: AGORA });
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: '2000000099999999' });
    await db.insert(reclamacoesMl).values({ claimId: '5999999991', devolucaoId: shopee.id, sincronizadaEm: AGORA });
    await db.insert(reclamacoesMl).values({ claimId: '5999999992', devolucaoId: null, sincronizadaEm: AGORA });
    await devolucaoAntiga({ pedidos: ['P-DIGITADO'] });
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 0 });
  });

  it('as que esperam o pacote (Pendente de chegada e No CD) vêm primeiro', async () => {
    const concluida = await devolucaoAntiga({ status: 'CONCLUIDA' });
    const noCd = await devolucaoAntiga({ status: 'NO_CD_MARKETPLACE' });
    await pedirVendasQueFaltam(db, fila, AGORA);
    expect(pedidas().map((e) => (e.dados as { claimId: string }).claimId)).toEqual([noCd.claimId, concluida.claimId]);
  });

  it('sem conta do ML ativa: não pede nada', async () => {
    await devolucaoAntiga();
    await db.delete(vendasMl);
    await sql`delete from contas_marketplace`;
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 0 });
    expect(await db.select().from(vendasMl)).toEqual([]);
  });

  it('o ritmo é da conta: o "Sincronizar agora" no meio do lote não pede outro; o lote seguinte começa 30 s depois da última leitura', async () => {
    for (let i = 0; i < RECLAMACOES_POR_RODADA + 2; i += 1) await devolucaoAntiga();
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: RECLAMACOES_POR_RODADA });
    // "Sincronizar agora" (ml.varredura sem chave única, D12) 1 min depois: ainda há leituras marcadas no futuro.
    expect(await pedirVendasQueFaltam(db, fila, depois(MINUTO))).toEqual({ pedidas: 0 });
    // As leituras rodaram (a última às 9,5 min); um "Sincronizar agora" logo depois começa 30 s depois dela.
    await lerAsPedidas();
    const ultimaMarcada = depois((RECLAMACOES_POR_RODADA - 1) * INTERVALO_LEITURAS_MS);
    expect(await pedirVendasQueFaltam(db, fila, new Date(ultimaMarcada.getTime() + 1000))).toEqual({ pedidas: 2 });
    expect(pedidas().at(-2)?.opcoes?.iniciarEm).toEqual(new Date(ultimaMarcada.getTime() + INTERVALO_LEITURAS_MS));
    expect(pedidas().at(-1)?.opcoes?.iniciarEm).toEqual(new Date(ultimaMarcada.getTime() + 2 * INTERVALO_LEITURAS_MS));
    // As linhas vazias guardam o horário marcado da leitura (o registro do ritmo).
    const marcadas = await db.select({ em: vendasMl.atualizadaEm }).from(vendasMl).where(isNull(vendasMl.situacao));
    expect(marcadas.map((l) => l.em.getTime()).sort()).toEqual([1, 2].map((n) => ultimaMarcada.getTime() + n * INTERVALO_LEITURAS_MS));
  });

  it('fila atrasada: leitura marcada há menos de 10 min que ainda não rodou segura o lote novo', async () => {
    await devolucaoAntiga();
    await devolucaoAntiga();
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 2 });
    await devolucaoAntiga();
    // Nada rodou (as linhas continuam vazias): a última foi marcada para AGORA + 30 s.
    expect(await pedirVendasQueFaltam(db, fila, depois(ESPERA_LOTE_MS))).toEqual({ pedidas: 0 });
    expect(await pedirVendasQueFaltam(db, fila, depois(ESPERA_LOTE_MS + INTERVALO_LEITURAS_MS + 1000))).toEqual({ pedidas: 1 });
  });

  it('a linha que continua vazia (o ML recusou, ou a conta falhou no meio) é pedida de novo depois de 1 dia, só no Recebimento ou na conferência', async () => {
    const pendente = await devolucaoAntiga({ status: 'NO_CD_MARKETPLACE' });
    const concluida = await devolucaoAntiga({ status: 'CONCLUIDA' });
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 2 });
    // Antes de 1 dia, nada.
    expect(await pedirVendasQueFaltam(db, fila, depois(NOVA_TENTATIVA_MS - MINUTO))).toEqual({ pedidas: 0 });
    const amanha = depois(NOVA_TENTATIVA_MS + 2 * MINUTO);
    expect(await pedirVendasQueFaltam(db, fila, amanha)).toEqual({ pedidas: 1 });
    expect((pedidas().at(-1)?.dados as { claimId: string }).claimId).toBe(pendente.claimId);
    // A linha ganha o horário novo (e não volta no dia seguinte antes de outro dia); a da concluída fica.
    const linhas = await db.select({ pedido: vendasMl.pedidoId, em: vendasMl.atualizadaEm }).from(vendasMl);
    expect(linhas.find((l) => l.pedido === pendente.pedidos[0])?.em).toEqual(amanha);
    expect(linhas.find((l) => l.pedido === concluida.pedidos[0])?.em).toEqual(depois(INTERVALO_LEITURAS_MS));
    expect(await pedirVendasQueFaltam(db, fila, depois(NOVA_TENTATIVA_MS + 30 * MINUTO))).toEqual({ pedidas: 0 });
    // Com os dados da venda, nunca mais.
    await lerAsPedidas();
    expect(await pedirVendasQueFaltam(db, fila, depois(3 * NOVA_TENTATIVA_MS))).toEqual({ pedidas: 0 });
  });

  it('a varredura (ml.varredura, a cada 15 min) chama o passo', async () => {
    const a = await devolucaoAntiga();
    await manipuladoresMercadoLivre['ml.varredura']!({}, { db, fila, agora: AGORA, tentativa: 1 });
    expect(pedidas().map((e) => e.dados)).toEqual([{ claimId: a.claimId }]);
  });
});

describe('pedirVendasQueFaltam: modo bitbrain (DEVOLUCOES_RPM é por empresa)', () => {
  beforeEach(async () => {
    usarModoBitbrain();
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
  });

  it('cada conta tem o seu espaçamento, a partir de agora; a tarefa leva a conta', async () => {
    const a1 = await devolucaoAntiga({ conta: 'loja-falsa-1' });
    const a2 = await devolucaoAntiga({ conta: 'loja-falsa-1' });
    const b1 = await devolucaoAntiga({ conta: 'loja-falsa-2' });
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 3 });
    expect(pedidas().map((e) => [e.dados, e.opcoes?.iniciarEm])).toEqual([
      [{ claimId: a1.claimId, conta: 'loja-falsa-1' }, AGORA],
      [{ claimId: a2.claimId, conta: 'loja-falsa-1' }, new Date(AGORA.getTime() + INTERVALO_LEITURAS_MS)],
      [{ claimId: b1.claimId, conta: 'loja-falsa-2' }, AGORA],
    ]);
    expect((await db.select({ conta: vendasMl.conta }).from(vendasMl)).map((v) => v.conta).sort()).toEqual(['loja-falsa-1', 'loja-falsa-1', 'loja-falsa-2']);
  });

  it(`${RECLAMACOES_POR_RODADA} por conta em cada rodada`, async () => {
    for (let i = 0; i < RECLAMACOES_POR_RODADA + 1; i += 1) await devolucaoAntiga({ conta: 'loja-falsa-1' });
    await devolucaoAntiga({ conta: 'loja-falsa-2' });
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: RECLAMACOES_POR_RODADA + 1 });
  });

  it('o ritmo é de cada conta: a conta com o lote em andamento espera; a outra ganha o seu', async () => {
    await devolucaoAntiga({ conta: 'loja-falsa-1' });
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 1 });
    const a2 = await devolucaoAntiga({ conta: 'loja-falsa-1' });
    const b1 = await devolucaoAntiga({ conta: 'loja-falsa-2' });
    expect(await pedirVendasQueFaltam(db, fila, depois(MINUTO))).toEqual({ pedidas: 1 });
    expect(pedidas().at(-1)?.dados).toEqual({ claimId: b1.claimId, conta: 'loja-falsa-2' });
    expect(pedidas().at(-1)?.opcoes?.iniciarEm).toEqual(depois(MINUTO));
    await lerAsPedidas();
    expect(await pedirVendasQueFaltam(db, fila, depois(2 * MINUTO))).toEqual({ pedidas: 1 });
    expect(pedidas().at(-1)?.dados).toEqual({ claimId: a2.claimId, conta: 'loja-falsa-1' });
  });

  it('só as contas que a varredura lê (marcadas e disponíveis); reclamação sem conta fica de fora', async () => {
    await devolucaoAntiga({ conta: 'loja-falsa-1' });
    await devolucaoAntiga({ conta: null });
    await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, 'loja-falsa-1'));
    await devolucaoAntiga({ conta: 'loja-falsa-2' });
    await db.update(contasBitbrain).set({ recebeDevolucoes: false }).where(eq(contasBitbrain.empresa, 'loja-falsa-2'));
    expect(await pedirVendasQueFaltam(db, fila, AGORA)).toEqual({ pedidas: 0 });
  });
});
