import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contestacoesCanal, devolucoes, itensDevolucao, motivosReclamacaoMl, reclamacoesMl } from '@/db/schema';
import { EXTRAS_VAZIOS } from '@/conectores/marketplace/mercadolivre/mapeamento';
import { obterContestacao } from './contestacoes';
import { darChegadaPeloPedido, receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { contaDaDevolucao } from './fabrica-conector';
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

  it('(E25) No CD do ML que chegou pelo Recebimento: a sincronização nunca a devolve ao CD nem à etapa 1', async () => {
    const pedido = '2000018992531744';
    const d = devolucaoExternaTeste({ pedidos: [pedido], rastreio: 'MM48351759365BRSP06', itens: [{ pedido, sku: 'SKU-ML-1', ean: null, quantidade: 1 }] });
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA));
    const noCd = { ...d, destinoEnvio: 'CD_MARKETPLACE' as const, statusCanal: 'delivered/delivered' };
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(noCd), AGORA);
    expect((await devolucao(devolucaoId)).status).toBe('NO_CD_MARKETPLACE');

    // O ML mandou o pacote de volta; a etiqueta trazia o pedido sem o "2" do começo.
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    // (E27) Pelo pedido a chegada não é registrada sozinha: a pessoa toca em "Dar chegada" na ficha.
    expect(await receberPorRastreio(db, '000018992531744', operador)).toMatchObject({ tipo: 'escolher', ids: [devolucaoId] });
    expect(await darChegadaPeloPedido(db, { devolucaoId, codigoLido: '000018992531744' }, operador)).toMatchObject({
      tipo: 'recebidas',
      achadaPor: 'PEDIDO_ML',
      doArmazemML: [expect.any(String)],
    });
    const depoisDaChegada = await acoes(devolucaoId);

    // A mesma reclamação de novo, ainda com destino armazém: nada muda, nem evento novo.
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(noCd), AGORA)).toMatchObject({ acao: 'atualizada', status: 'AGUARDANDO_CONFERENCIA' });
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'MM48351759365BRSP06' });
    expect(await acoes(devolucaoId)).toEqual(depoisDaChegada);

    // O reenvio da triagem com rastreio novo, depois da chegada, também não move: só vira ml_status_apos_chegada.
    const triagem = { ...d, destinoEnvio: 'VENDEDOR' as const, reenvioDaTriagem: true, rastreio: 'TRIAGEM123BR', statusCanal: 'shipped/shipped' };
    expect(await aplicarReclamacao(db, dadosDevolucaoMLTeste(triagem), AGORA)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA' });
    expect(await devolucao(devolucaoId)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'MM48351759365BRSP06' });
    expect(await acoes(devolucaoId)).toEqual([...depoisDaChegada, 'ml_status_apos_chegada']);
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

describe('motivo da reclamação do ML no "Motivo do cliente" (melhoria 1)', () => {
  const MOTIVO = 'Comprador se arrependeu';
  async function emCache(id: string, nome: string) {
    await db.insert(motivosReclamacaoMl).values({ id, nome, consultadoEm: AGORA });
  }

  it('motivo em cache vira o Motivo do cliente na criação, e o código fica em reclamacoes_ml', async () => {
    await emCache('PDD9949', MOTIVO);
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { motivoId: 'PDD9949' }), AGORA));
    expect((await devolucao(devolucaoId)).motivoCliente).toBe(MOTIVO);
    expect((await reclamacao(d.reclamacaoId)).motivoId).toBe('PDD9949');
  });

  it('sem texto do motivo, o Motivo do cliente fica vazio (nunca o código cru)', async () => {
    const d = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { motivoId: 'PDD9949' }), AGORA));
    expect((await devolucao(devolucaoId)).motivoCliente).toBeNull();
    expect((await reclamacao(d.reclamacaoId)).motivoId).toBe('PDD9949');
  });

  it('na atualização preenche só se vazio; o digitado à mão não é sobrescrito', async () => {
    const d = devolucaoExternaTeste();
    const dados = dadosDevolucaoMLTeste(d, { motivoId: 'PDD9949' });
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dados, AGORA));
    await db.update(devolucoes).set({ motivoCliente: '  ' }).where(eq(devolucoes.id, devolucaoId));
    await emCache('PDD9949', MOTIVO);
    expect(await aplicarReclamacao(db, dados, AGORA)).toMatchObject({ acao: 'atualizada' });
    expect((await devolucao(devolucaoId)).motivoCliente).toBe(MOTIVO);

    await db.update(devolucoes).set({ motivoCliente: '\n\t \r' }).where(eq(devolucoes.id, devolucaoId));
    await aplicarReclamacao(db, dados, AGORA);
    expect((await devolucao(devolucaoId)).motivoCliente).toBe(MOTIVO);

    await db.update(devolucoes).set({ motivoCliente: ' Tamanho errado ' }).where(eq(devolucoes.id, devolucaoId));
    await aplicarReclamacao(db, dados, AGORA);
    expect((await devolucao(devolucaoId)).motivoCliente).toBe(' Tamanho errado ');
  });

  it('D9: no vínculo, a manual com motivo fica com o dela; a manual sem motivo recebe o do ML', async () => {
    await emCache('PDD9949', MOTIVO);
    const operador = await criarUsuarioTeste(db);
    const comMotivo = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-MOT-1', rastreio: null, motivoCliente: 'Não serviu' });
    const semMotivo = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-MOT-2', rastreio: null });
    for (const pedido of ['P-MOT-1', 'P-MOT-2']) {
      const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(devolucaoExternaTeste({ pedidos: [pedido] }), { motivoId: 'PDD9949' }), AGORA);
      expect(r).toMatchObject({ acao: 'vinculada' });
    }
    expect((await devolucao(comMotivo.id)).motivoCliente).toBe('Não serviu');
    expect((await devolucao(semMotivo.id)).motivoCliente).toBe(MOTIVO);
  });
});

describe('extras e conta em reclamacoes_ml (integração Bitbrain, D8)', () => {
  const EXTRAS = {
    acaoPendente: 'return_review_ok',
    urgente: true,
    afetaReputacao: 'AFETA',
    ehFull: true,
    triagemCondicao: 'NAO_VENDAVEL',
    triagemEtapa: 'closed',
    dinheiro: 'RETIDO',
  } as const;
  const linha = async (claimId: string) => (await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId)))[0];

  it('grava os extras e a conta', async () => {
    const dados = dadosDevolucaoMLTeste(devolucaoExternaTeste(), { extras: EXTRAS });
    await aplicarReclamacao(db, dados, AGORA, undefined, 'loja-falsa-1');
    expect(await linha(dados.reclamacaoId)).toMatchObject({ ...EXTRAS, conta: 'loja-falsa-1', respostaPendente: null });
  });

  it('de novo: urgente e ação acompanham o ML; os outros extras nulos não apagam o que já se sabia; sem conta, a conta fica', async () => {
    const externa = devolucaoExternaTeste();
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa, { extras: EXTRAS }), AGORA, undefined, 'loja-falsa-1');
    const depois = dadosDevolucaoMLTeste(externa, { extras: { ...EXTRAS_VAZIOS, urgente: false } });
    await aplicarReclamacao(db, depois, AGORA, undefined, null);
    expect(await linha(depois.reclamacaoId)).toMatchObject({
      urgente: false,
      acaoPendente: null,
      afetaReputacao: 'AFETA',
      ehFull: true,
      triagemCondicao: 'NAO_VENDAVEL',
      triagemEtapa: 'closed',
      dinheiro: 'RETIDO',
      conta: 'loja-falsa-1',
    });
  });

  it('a reclamação lida sem a devolução não desfaz a ligação: devolução, return_id, subtipo, status da devolução e conta ficam (E26)', async () => {
    const externa = devolucaoExternaTeste();
    const { devolucaoId } = comDevolucao(await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa, { extras: EXTRAS }), AGORA, undefined, 'loja-falsa-1'));
    const antes = await linha(externa.reclamacaoId);
    expect(antes).toMatchObject({ devolucaoId, returnId: externa.devolucaoExternaId, subtipo: 'return_total' });
    expect(antes.statusDevolucao).not.toBeNull();

    const semDevolucao = dadosDevolucaoMLTeste(null, { reclamacaoId: externa.reclamacaoId, statusReclamacao: 'closed' });
    expect(await aplicarReclamacao(db, semDevolucao, AGORA, undefined, 'loja-falsa-1')).toEqual({ acao: 'sem_devolucao' });
    expect(await linha(externa.reclamacaoId)).toMatchObject({
      devolucaoId,
      returnId: externa.devolucaoExternaId,
      subtipo: 'return_total',
      statusDevolucao: antes.statusDevolucao,
      statusReclamacao: 'closed',
      triagemEtapa: 'closed',
      conta: 'loja-falsa-1',
    });
    // O que se perdia na produção (23/11): sem a ligação, o sistema não sabia de qual conta era a devolução.
    expect(await contaDaDevolucao(db, devolucaoId)).toBe('loja-falsa-1');
  });

  it('modo api (sem conta): a conta fica nula; reclamação sem devolução também guarda os extras', async () => {
    const dados = dadosDevolucaoMLTeste(null, { extras: { ...EXTRAS_VAZIOS, urgente: true, acaoPendente: 'return_review_ok' } });
    await aplicarReclamacao(db, dados, AGORA);
    expect(await linha(dados.reclamacaoId)).toMatchObject({ conta: null, urgente: true, acaoPendente: 'return_review_ok' });
  });
});
