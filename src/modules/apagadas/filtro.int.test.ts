import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao, reclamacoesMl, retiradasFull } from '@/db/schema';
import {
  contarSemFornecedor,
  contestacoesComPrazoVencendo,
  devolucoesComAlertaLote,
  devolucoesComMLEncerradoAposChegada,
  devolucoesComPrazoVencendo,
  devolucoesEntreguesSemLeitura,
  notasRejeitadas,
} from '@/modules/acabamento/alertas-devolucoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { localizarParaConferencia } from '@/modules/conferencia/localizar';
import { obterConferencia } from '@/modules/conferencia/leitura';
import { iniciarConferencia } from '@/modules/conferencia/trava';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { chavePedido, codigosAtivosPorPedido, codigosNaoIdentificadosPorRastreio } from '@/modules/devolucoes/criar';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import { encerrarPendente } from '@/modules/devolucoes/excecoes';
import { contarEstoque, montarQuadro } from '@/modules/devolucoes/quadro';
import { criarNaoIdentificada, darChegadaPeloPedido, receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { contarAfetamReputacao } from '@/modules/devolucoes/reputacao';
import { carregarDossie } from '@/modules/dossie/carregar';
import { registrarEvento } from '@/modules/historico/eventos';
import { listarSemFornecedor } from '@/modules/lotes/consultas';
import { contarContestacoes, listarContestacoes, obterContestacao } from '@/modules/mercado-livre/contestacoes';
import { contarRespostasParaDarNoML, listarOkPendentes } from '@/modules/mercado-livre/respostas-manuais';
import { listarRetiradas, obterRetirada } from '@/modules/retiradas/consultas';
import { biparProduto, criarRetirada, situacaoParaEnvio } from '@/modules/retiradas/retiradas';
import { listarVoltaAoArmazem, resumirVoltaAoArmazem } from '@/modules/volta-armazem/consulta';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarContestacaoTeste, criarNotaRejeitadaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { criarDevolucaoChegada } from '../../../tests/helpers/fabricas-conferencia';
import { criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { criarRetiradaTeste } from '../../../tests/helpers/fabricas-retiradas';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-27T15:00:00Z');
const HOJE = { de: '2026-11-27', ate: '2026-11-27' };
let operador: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(() => sql.end());

/** Apaga direto no banco (o serviço `apagarDevolucao` tem o próprio teste): aqui só importa a marca. */
async function esconder(id: string): Promise<void> {
  await db.update(devolucoes).set({ apagadaEm: AGORA, apagadaPor: gestor.id }).where(eq(devolucoes.id, id));
}
async function esconderRetirada(id: string): Promise<void> {
  await db.update(retiradasFull).set({ apagadaEm: AGORA, apagadaPor: gestor.id }).where(eq(retiradasFull.id, id));
}
async function comStatus(status: (typeof devolucoes.$inferSelect)['status'], dados: Parameters<typeof criarDevolucaoTeste>[2] = {}) {
  const d = await criarDevolucaoTeste(db, operador, dados);
  await db.update(devolucoes).set({ status }).where(eq(devolucoes.id, d.id));
  return d;
}

describe('quadro, etapas, busca e contagens (E29: nada mostra o que está apagado)', () => {
  it('buscarDevolucoes (busca, etapas e alertas pelo id) e montarQuadro só trazem a visível', async () => {
    const visivel = await criarDevolucaoTeste(db, operador);
    const apagada = await criarDevolucaoTeste(db, operador);
    await esconder(apagada.id);
    const busca = await buscarDevolucoes(db, {});
    expect(busca.devolucoes.map((d) => d.codigo)).toEqual([visivel.codigo]);
    expect(busca.total).toBe(1);
    const porId = await buscarDevolucoes(db, {}, { ids: [visivel.id, apagada.id] });
    expect(porId.devolucoes.map((d) => d.codigo)).toEqual([visivel.codigo]);
    const quadro = await montarQuadro(db, AGORA);
    expect(quadro[0].total).toBe(1);
    expect(quadro[0].cartoes.map((c) => c.codigo)).toEqual([visivel.codigo]);
  });

  it('contarEstoque (etapa 4) ignora a apagada', async () => {
    await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    const apagada = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }, { destino: 'PROBLEMA' }] });
    await esconder(apagada.id);
    expect(await contarEstoque(db)).toEqual({ bom: 1, problema: 0 });
  });

  it('contarAfetamReputacao ignora a apagada', async () => {
    for (const [i, esconde] of [false, true].entries()) {
      const d = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
      await db.insert(reclamacoesMl).values({ claimId: `5100000${i}`, devolucaoId: d.id, afetaReputacao: 'AFETA', sincronizadaEm: AGORA });
      if (esconde) await esconder(d.id);
    }
    expect(await contarAfetamReputacao(db)).toBe(1);
  });
});

describe('alertas do painel', () => {
  it('prazo vencendo, entregue sem leitura, NF rejeitada, ML encerrado, alerta de lote e sem fornecedor ignoram a apagada', async () => {
    const prazo = new Date(AGORA.getTime() + 60 * 60 * 1000);
    const entregue = new Date('2026-11-20T12:00:00Z');
    const ids: { visivel: string; apagada: string }[] = [];
    for (const esconde of [false, true]) {
      const d = await criarDevolucaoTeste(db, operador);
      await db.update(devolucoes).set({ prazoConferenciaCanal: prazo, entregueSegundoCanalEm: entregue }).where(eq(devolucoes.id, d.id));
      await criarNotaRejeitadaTeste(db, { devolucaoId: d.id });
      await criarContestacaoTeste(db, d.id, { status: 'AGUARDANDO_GESTOR', prazo });
      await registrarEvento(db, { entidade: 'devolucao', entidadeId: d.id, acao: 'ml_status_apos_chegada', usuarioId: null, em: AGORA, dados: { statusCanal: 'cancelled' } });
      await registrarEvento(db, { entidade: 'devolucao', entidadeId: d.id, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: AGORA });
      await db.update(itensDevolucao).set({ status: 'SEM_FORNECEDOR', destino: 'PROBLEMA', motivo: 'AVARIADO' }).where(eq(itensDevolucao.devolucaoId, d.id));
      if (esconde) await esconder(d.id);
      ids.push({ visivel: esconde ? '' : d.id, apagada: esconde ? d.id : '' });
    }
    const visivel = ids[0].visivel;
    expect(await devolucoesComPrazoVencendo(db, AGORA)).toEqual([visivel]);
    expect(await devolucoesEntreguesSemLeitura(db, AGORA)).toEqual([visivel]);
    expect((await notasRejeitadas(db)).devolucaoIds).toEqual([visivel]);
    expect(await contestacoesComPrazoVencendo(db, AGORA)).toHaveLength(1);
    expect(await devolucoesComMLEncerradoAposChegada(db, AGORA)).toEqual([visivel]);
    expect(await devolucoesComAlertaLote(db, AGORA)).toEqual([visivel]);
    expect(await contarSemFornecedor(db)).toBe(1);
    const semFornecedor = await listarSemFornecedor(db);
    expect(semFornecedor.total).toBe(1);
    expect(semFornecedor.unidades).toHaveLength(1);
  });
});

describe('recebimento: a leitura não acha a apagada', () => {
  it('o rastreio da apagada dá "não encontrada", e o pacote pode virar não identificada', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR-APAGADA-1' });
    await esconder(d.id);
    expect(await receberPorRastreio(db, 'BR-APAGADA-1', operador, AGORA)).toEqual({ tipo: 'nao_encontrada', rastreio: 'BR-APAGADA-1' });
    const [linha] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, d.id));
    expect(linha.status).toBe('PENDENTE_CHEGADA');
    const nova = await criarNaoIdentificada(db, 'BR-APAGADA-1', operador, AGORA);
    expect(nova.codigo).toMatch(/^DEV-/);
  });

  it('pelo número do pedido do ML e pelo "Dar chegada" a apagada não aparece', async () => {
    const d = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: '2000012345678901' });
    await esconder(d.id);
    expect(await receberPorRastreio(db, '2000012345678901', operador, AGORA)).toEqual({ tipo: 'nao_encontrada', rastreio: '2000012345678901' });
    await expect(darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000012345678901' }, operador, AGORA)).rejects.toThrow(
      'Devolução não encontrada.',
    );
  });

  it('codigosAtivosPorPedido e codigosNaoIdentificadosPorRastreio não contam a apagada (o pedido pode ganhar outra devolução)', async () => {
    const d = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'SHP-APAGADA' });
    const ni = await criarNaoIdentificada(db, 'NI-APAGADA', operador, AGORA);
    await esconder(d.id);
    await esconder(ni.id);
    expect((await codigosAtivosPorPedido(db, [{ canal: 'SHOPEE', pedido: 'SHP-APAGADA' }])).get(chavePedido('SHOPEE', 'SHP-APAGADA'))).toBeUndefined();
    expect((await codigosNaoIdentificadosPorRastreio(db, ['NI-APAGADA'])).size).toBe(0);
    await expect(criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'SHP-APAGADA' })).resolves.toMatchObject({ codigo: expect.any(String) });
  });
});

describe('conferência, detalhe, dossiê e ações sobre a apagada', () => {
  it('Conferir pacote, a bancada, o detalhe e o dossiê não acham a apagada; o Gestor pode pedir o detalhe dela', async () => {
    const d = await criarDevolucaoChegada(db, operador, { rastreio: 'BR-CONF-APAGADA' });
    await esconder(d.id);
    await expect(localizarParaConferencia(db, d.codigo, operador)).rejects.toThrow(`Devolução ${d.codigo} não encontrada.`);
    await expect(localizarParaConferencia(db, 'BR-CONF-APAGADA', operador)).rejects.toThrow(/Nenhuma devolução com este código/);
    expect(await obterConferencia(db, { id: d.id })).toBeNull();
    expect(await obterDetalhe(db, d.codigo)).toBeNull();
    expect(await carregarDossie(db, d.codigo, { em: AGORA })).toBeNull();
    expect((await obterDetalhe(db, d.codigo, { incluirApagada: true }))?.apagadaEm).toEqual(AGORA);
    expect(await obterConferencia(db, { id: d.id }, { incluirApagada: true })).not.toBeNull();
  });

  it('iniciar a conferência, cancelar e identificar recusam a apagada', async () => {
    const chegou = await criarDevolucaoChegada(db, operador);
    const pendente = await criarDevolucaoTeste(db, operador);
    await esconder(chegou.id);
    await esconder(pendente.id);
    await expect(iniciarConferencia(db, chegou.id, operador, AGORA)).rejects.toThrow('Devolução não encontrada.');
    await expect(encerrarPendente(db, pendente.id, 'CANCELADA', 'Cliente desistiu', gestor, AGORA)).rejects.toThrow('Devolução não encontrada.');
  });
});

describe('planilha Volta ao armazém', () => {
  it('não traz as unidades da devolução apagada nem os itens da retirada apagada', async () => {
    const visivel = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }], agora: AGORA });
    const apagada = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }], agora: AGORA });
    await esconder(apagada.id);
    const rVisivel = await criarRetiradaTeste(db, operador, { itens: [{ descricao: 'Fone', eanLido: '789', quantidade: 2 }], concluidaEm: AGORA });
    const rApagada = await criarRetiradaTeste(db, operador, { itens: [{ descricao: 'Mouse', eanLido: '790', quantidade: 5 }], concluidaEm: AGORA });
    await esconderRetirada(rApagada.id);
    const linhas = await listarVoltaAoArmazem(db, HOJE);
    expect(linhas.map((l) => l.origem).sort()).toEqual([visivel.codigo, rVisivel.codigo].sort());
    expect(await resumirVoltaAoArmazem(db, HOJE)).toEqual({ linhas: 2, unidades: 3 });
  });
});

describe('contestações e respostas para dar no ML', () => {
  it('a contestação da apagada sai da lista, da contagem e do detalhe', async () => {
    const visivel = await comStatus('AGUARDANDO_NF', { canal: 'MERCADO_LIVRE' });
    const apagada = await comStatus('AGUARDANDO_NF', { canal: 'MERCADO_LIVRE' });
    await criarContestacaoTeste(db, visivel.id, { status: 'AGUARDANDO_GESTOR', prazo: null });
    const escondida = await criarContestacaoTeste(db, apagada.id, { status: 'AGUARDANDO_GESTOR', prazo: null });
    await esconder(apagada.id);
    expect((await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA)).map((c) => c.codigo)).toEqual([visivel.codigo]);
    expect((await contarContestacoes(db)).AGUARDANDO_GESTOR).toBe(1);
    expect(await obterContestacao(db, escondida.id, AGORA)).toBeNull();
    expect(await contarRespostasParaDarNoML(db)).toBe(1);
  });

  it('o "OK" pendente da apagada sai da lista e da contagem', async () => {
    for (const [i, esconde] of [false, true].entries()) {
      const d = await comStatus('AGUARDANDO_NF', { canal: 'MERCADO_LIVRE' });
      await db.insert(reclamacoesMl).values({ claimId: `5200000${i}`, devolucaoId: d.id, respostaPendente: 'OK', sincronizadaEm: AGORA });
      if (esconde) await esconder(d.id);
    }
    expect(await listarOkPendentes(db, AGORA)).toHaveLength(1);
    expect(await contarRespostasParaDarNoML(db)).toBe(1);
  });
});

describe('retiradas do Full', () => {
  it('a lista, o detalhe e o envio de foto não acham a retirada apagada; o Gestor pode pedir o detalhe dela', async () => {
    const visivel = await criarRetiradaTeste(db, operador, { itens: [] });
    const apagada = await criarRetiradaTeste(db, operador, { itens: [] });
    await esconderRetirada(apagada.id);
    const lista = await listarRetiradas(db, { pagina: 1 });
    expect(lista.retiradas.map((r) => r.codigo)).toEqual([visivel.codigo]);
    expect(lista.total).toBe(1);
    expect(await obterRetirada(db, apagada.codigo)).toBeNull();
    expect((await obterRetirada(db, apagada.codigo, { incluirApagada: true }))?.apagadaEm).toEqual(AGORA);
    expect(await situacaoParaEnvio(db, apagada.id, null)).toEqual({ existe: false, aberta: false, itemDaRetirada: false });
    await expect(biparProduto(db, apagada.id, '7891234567890', 'Algo', operador)).rejects.toThrow('Retirada não encontrada.');
  });

  it('criarRetirada não reaproveita a retirada Aberta apagada com a mesma etiqueta', async () => {
    const primeira = await criarRetirada(db, 'RET-APAGADA-1', operador, AGORA);
    await esconderRetirada(primeira.id);
    const segunda = await criarRetirada(db, 'RET-APAGADA-1', operador, AGORA);
    expect(segunda.nova).toBe(true);
    expect(segunda.id).not.toBe(primeira.id);
  });
});
