import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contestacoesCanal, devolucoes, itensDevolucao, reclamacoesMl } from '@/db/schema';
import { obterContestacao } from './contestacoes';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { aplicarReclamacao, type ResultadoAplicacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

async function devolucao(id: string) {
  const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, id));
  return d;
}
async function acoes(id: string) {
  return (await listarEventos(db, 'devolucao', id)).map((e) => e.acao);
}
async function reclamacao(claimId: string) {
  const [r] = await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId));
  return r;
}
function comDevolucao(r: ResultadoAplicacao): { devolucaoId: string; codigo: string } {
  if (!('devolucaoId' in r)) throw new Error(`esperava uma devolução, veio ${r.acao}`);
  return r;
}

describe('aplicarReclamacao (contrato §5.5, spec §7.2 e §7.3)', () => {
  it('cria pela API: Pendente de chegada, uma linha por unidade, SKU e rastreio normalizados, e o estado em reclamacoes_ml', async () => {
    const produtoId = await criarProdutoTeste(db, { sku: 'FONE-01' });
    const d = devolucaoExternaTeste({ pedidos: ['P1'], rastreio: 'ml 123 br', itens: [{ pedido: 'P1', sku: 'fone-01', ean: null, quantidade: 2 }] });
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA);
    expect(r).toMatchObject({ acao: 'criada', status: 'PENDENTE_CHEGADA' });
    const { devolucaoId } = comDevolucao(r);
    expect(await devolucao(devolucaoId)).toMatchObject({
      origem: 'API',
      canal: 'MERCADO_LIVRE',
      criadoPor: null,
      devolucaoExternaId: d.devolucaoExternaId,
      reclamacaoId: d.reclamacaoId,
      pedidosExternos: ['P1'],
      rastreio: 'ML123BR',
      statusCanal: 'shipped/shipped',
    });
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId));
    expect(itens.map((i) => [i.sku, i.produtoEsperadoId])).toEqual([
      ['FONE-01', produtoId],
      ['FONE-01', produtoId],
    ]);
    expect(await reclamacao(d.reclamacaoId)).toMatchObject({
      returnId: d.devolucaoExternaId,
      subtipo: 'return_total',
      statusDevolucao: 'shipped',
      devolucaoId,
      sincronizadaEm: AGORA,
    });
  });

  it('de novo: atualiza sem duplicar; status do ML mudou → ml_status_atualizado; igual → nada', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    const mudou = { ...d, statusCanal: 'pending_delivered/shipped' };
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(mudou), AGORA)).toMatchObject({ acao: 'atualizada', devolucaoId });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(mudou), AGORA);
    expect(await db.select().from(devolucoes)).toHaveLength(1);
    expect((await devolucao(devolucaoId)).statusCanal).toBe('pending_delivered/shipped');
    expect(await acoes(devolucaoId)).toEqual(['criada', 'ml_status_atualizado']);
  });

  it('D9: vincula a devolução manual ativa do mesmo pedido, sem criar outra', async () => {
    const operador = await criarUsuarioTeste(db);
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-D9', rastreio: null });
    const d = devolucaoExternaTeste({ pedidos: ['P-D9'] });
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA)).toMatchObject({ acao: 'vinculada', devolucaoId: manual.id });
    expect(await devolucao(manual.id)).toMatchObject({
      origem: 'MANUAL',
      devolucaoExternaId: d.devolucaoExternaId,
      reclamacaoId: d.reclamacaoId,
      rastreio: d.rastreio,
      statusCanal: d.statusCanal,
    });
    expect(await db.select().from(devolucoes)).toHaveLength(1);
    expect(await acoes(manual.id)).toEqual(['criada', 'ml_vinculada']);
  });

  it('D9: o ML é a fonte da reclamação; o texto manual diferente vai para o evento ml_vinculada', async () => {
    const operador = await criarUsuarioTeste(db);
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-ERRADO', rastreio: null });
    await db.update(devolucoes).set({ reclamacaoId: 'digitado-errado' }).where(eq(devolucoes.id, manual.id));
    const d = devolucaoExternaTeste({ pedidos: ['P-ERRADO'] });
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA);
    expect((await devolucao(manual.id)).reclamacaoId).toBe(d.reclamacaoId);
    const eventos = await listarEventos(db, 'devolucao', manual.id);
    const vinculada = eventos.find((e) => e.acao === 'ml_vinculada');
    expect(vinculada?.dados).toMatchObject({ reclamacaoId: d.reclamacaoId, reclamacaoIdManual: 'digitado-errado' });
  });

  it('atualização: o prazo da contestação acompanha o prazo da devolução (não enviada)', async () => {
    const d = devolucaoExternaTeste({ pedidos: ['P-PRAZO'], prazoConferencia: null });
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    const [c] = await db
      .insert(contestacoesCanal)
      .values({ devolucaoId, motivoCanal: 'SRF2', mensagem: 'm', prazo: null })
      .returning({ id: contestacoesCanal.id });
    expect((await obterContestacao(db, c.id, AGORA))?.prazo ?? null).toBeNull();
    const prazo = new Date('2026-11-20T12:00:00Z');
    await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, prazoConferencia: prazo }), AGORA);
    expect((await obterContestacao(db, c.id, AGORA))?.prazo).toEqual(prazo);
  });

  it('vinculada depois da conferência: manda o resultado ao ML de novo (decisão 11)', async () => {
    const operador = await criarUsuarioTeste(db);
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-CONF' });
    await db.update(devolucoes).set({ status: 'AGUARDANDO_NF' }).where(eq(devolucoes.id, manual.id));
    const fila = new FilaMemoria();
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(devolucaoExternaTeste({ pedidos: ['P-CONF'] })), AGORA, fila);
    expect(fila.enviadas).toEqual([expect.objectContaining({ nome: 'ml.enviar-resultado', dados: { devolucaoId: manual.id } })]);
  });

  it('D10: low_cost fica só em reclamacoes_ml, sem devolução', async () => {
    const d = devolucaoExternaTeste({ semEnvioFisico: true, destinoEnvio: null, rastreio: null, statusCanal: 'closed' });
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA)).toEqual({ acao: 'so_consulta', motivo: 'low_cost' });
    expect(await db.select().from(devolucoes)).toEqual([]);
    expect(await reclamacao(d.reclamacaoId)).toMatchObject({ subtipo: 'low_cost', devolucaoId: null });
  });

  it('cancelada no ML já na primeira vez: não vira devolução (decisão 3)', async () => {
    const d = devolucaoExternaTeste({ statusCanal: 'cancelled/cancelled' });
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA)).toEqual({ acao: 'so_consulta', motivo: 'encerrada_no_ml' });
    expect(await db.select().from(devolucoes)).toEqual([]);
  });

  it('Pendente de chegada e cancelada no ML → CANCELADA, com o motivo no histórico', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, statusCanal: 'cancelled/cancelled' }), AGORA)).toMatchObject({
      acao: 'atualizada',
      status: 'CANCELADA',
    });
    const eventos = await listarEventos(db, 'devolucao', devolucaoId);
    expect(eventos.at(-1)).toMatchObject({
      acao: 'cancelada',
      de: 'PENDENTE_CHEGADA',
      para: 'CANCELADA',
      usuarioNome: null,
      dados: { motivo: 'Status no Mercado Livre: Cancelada no ML' },
    });
  });

  it('CD do ML e reenvio da triagem: NO_CD_MARKETPLACE e de volta, com o rastreio novo', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, destinoEnvio: 'CD_MARKETPLACE', statusCanal: 'delivered/delivered' }), AGORA);
    expect((await devolucao(devolucaoId)).status).toBe('NO_CD_MARKETPLACE');
    const triagem = { ...d, destinoEnvio: 'VENDEDOR' as const, reenvioDaTriagem: true, rastreio: 'TRIAGEM123BR', statusCanal: 'shipped/shipped' };
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(triagem), AGORA);
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'PENDENTE_CHEGADA', rastreio: 'TRIAGEM123BR' });
    expect(await acoes(devolucaoId)).toEqual(['criada', 'ml_status_atualizado', 'ml_no_cd', 'ml_status_atualizado', 'ml_reenviada_ao_vendedor']);
  });

  it('entregue segundo o ML: preenche a data, não muda o status e registra ml_entregue uma vez (spec §5.2)', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    const entregue = { ...d, statusCanal: 'delivered/delivered', entregueEm: new Date('2026-11-12T10:00:00Z') };
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(entregue), AGORA);
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(entregue), AGORA);
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'PENDENTE_CHEGADA', entregueSegundoCanalEm: new Date('2026-11-12T10:00:00Z') });
    expect((await acoes(devolucaoId)).filter((a) => a === 'ml_entregue')).toHaveLength(1);
  });

  it('depois da chegada física: status do ML diferente só vira o evento ml_status_apos_chegada', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'LIDO123' }).where(eq(devolucoes.id, devolucaoId));
    await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, statusCanal: 'cancelled/cancelled', rastreio: 'OUTRO' }), AGORA);
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'LIDO123' });
    expect((await acoes(devolucaoId)).at(-1)).toBe('ml_status_apos_chegada');
  });

  it('aviso e varredura ao mesmo tempo: uma devolução só (trava por reclamação)', async () => {
    const dados = dadosDevolucaoMLTeste(devolucaoExternaTeste());
    const resultados = await Promise.all([aplicarReclamacao(db, dados, AGORA), aplicarReclamacao(db, dados, AGORA)]);
    expect(resultados.map((r) => r.acao).sort()).toEqual(['atualizada', 'criada']);
    expect(await db.select().from(devolucoes)).toHaveLength(1);
  });

  it('reclamação sem devolução: só o registro em reclamacoes_ml', async () => {
    const dados = dadosDevolucaoMLTeste(null);
    expect(await aplicarReclamacao(db, dados, AGORA)).toEqual({ acao: 'sem_devolucao' });
    expect(await reclamacao(dados.reclamacaoId)).toMatchObject({ returnId: null, devolucaoId: null });
  });
});
