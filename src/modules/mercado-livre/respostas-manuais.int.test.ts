import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal, reclamacoesMl } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configBitbrainTeste, contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { ConectorMLMemoria, configMLTeste, devolucaoMLConferidaTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { enviarContestacao, ErroContestacao, obterContestacao, revisarEEnviar } from './contestacoes';
import { contarRespostasParaDarNoML, listarOkPendentes, marcarContestacaoRespondida, marcarOkRespondido } from './respostas-manuais';
import { processarResultadoConferencia } from './resultado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
const BB = configBitbrainTeste();
let conector: ConectorMLMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => sql.end());

const pendente = async (devolucaoId: string) =>
  (await db.select({ r: reclamacoesMl.respostaPendente }).from(reclamacoesMl).where(eq(reclamacoesMl.devolucaoId, devolucaoId)))[0]?.r ?? null;
const acoes = async (id: string) => (await listarEventos(db, 'devolucao', id)).map((e) => e.acao);
const conferidaBom = () => devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
const conferidaProblema = () => devolucaoMLConferidaTeste(db, { itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO' }] });
async function contestacaoDe(devolucaoId: string) {
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, devolucaoId));
  return c;
}

describe('ml.enviar-resultado no modo bitbrain (§4.6)', () => {
  it('todos BOM: grava resposta_pendente OK e o evento, sem chamar o ML', async () => {
    const d = await conferidaBom();
    expect(await processarResultadoConferencia(db, d.id, AGORA, BB)).toBe('ok_pendente_manual');
    expect(conector.enviados).toEqual([]);
    expect(await pendente(d.id)).toBe('OK');
    expect(await acoes(d.id)).toContain('ml_resposta_manual_pendente');
  });

  it('rodar de novo não repete; depois de respondido, a pendência não volta', async () => {
    const d = await conferidaBom();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    await marcarOkRespondido(db, d.id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    expect(await processarResultadoConferencia(db, d.id, AGORA, BB)).toBe('ok_pendente_ja_registrado');
    expect(await pendente(d.id)).toBeNull();
    expect((await acoes(d.id)).filter((a) => a === 'ml_resposta_manual_pendente')).toHaveLength(1);
  });

  it('algum problema: a contestação nasce AGUARDANDO_GESTOR, como hoje, e não há OK pendente', async () => {
    const d = await conferidaProblema();
    expect(await processarResultadoConferencia(db, d.id, AGORA, BB)).toBe('contestacao_criada');
    expect((await contestacaoDe(d.id)).status).toBe('AGUARDANDO_GESTOR');
    expect(await pendente(d.id)).toBeNull();
  });

  it('modo api: o OK vai ao ML como hoje (regressão)', async () => {
    const d = await conferidaBom();
    expect(await processarResultadoConferencia(db, d.id, AGORA, configMLTeste())).toBe('ok_enviado');
    expect(conector.enviados).toHaveLength(1);
    expect(await pendente(d.id)).toBeNull();
  });
});

describe('contestação respondida à mão', () => {
  it('Gestor leva a ENVIADA com a data e o usuário, e registra o evento; o ML não é chamado', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const c = await contestacaoDe(d.id);
    await marcarContestacaoRespondida(db, c.id, gestor, AGORA, BB);
    expect(await contestacaoDe(d.id)).toMatchObject({ status: 'ENVIADA', enviadaEm: AGORA, revisadoPor: gestor.id, erro: null });
    const evento = (await listarEventos(db, 'devolucao', d.id)).find((e) => e.acao === 'ml_contestacao_respondida_a_mao');
    expect(evento).toMatchObject({ usuarioNome: gestor.nome, dados: { contestacaoId: c.id, motivo: 'SRF2' } });
    expect(conector.enviados).toEqual([]);
  });

  it('recusas: Operador, já respondida, id inválido e fora do modo bitbrain', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const c = await contestacaoDe(d.id);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await expect(marcarContestacaoRespondida(db, c.id, await criarUsuarioTeste(db, 'OPERADOR'), AGORA, BB)).rejects.toBeInstanceOf(ErroContestacao);
    await expect(marcarContestacaoRespondida(db, c.id, gestor, AGORA, configMLTeste())).rejects.toThrow('só vale no modo Bitbrain');
    await expect(marcarContestacaoRespondida(db, 'nao-e-uuid', gestor, AGORA, BB)).rejects.toThrow('Contestação não encontrada.');
    await marcarContestacaoRespondida(db, c.id, gestor, AGORA, BB);
    await expect(marcarContestacaoRespondida(db, c.id, gestor, AGORA, BB)).rejects.toThrow('já está marcada como respondida');
  });

  it('contestação com falha (FALHOU) também pode ser marcada como respondida', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const c = await contestacaoDe(d.id);
    await db.update(contestacoesCanal).set({ status: 'FALHOU', erro: 'x' }).where(eq(contestacoesCanal.id, c.id));
    await marcarContestacaoRespondida(db, c.id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    expect((await contestacaoDe(d.id)).status).toBe('ENVIADA');
  });

  it('o detalhe da contestação traz a conta (nome do Bitbrain)', async () => {
    await contasFalsasTeste(db);
    const d = await conferidaProblema();
    await db.insert(reclamacoesMl).values({ claimId: d.externa!.reclamacaoId, devolucaoId: d.id, conta: 'loja-falsa-1', sincronizadaEm: AGORA });
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    expect((await obterContestacao(db, (await contestacaoDe(d.id)).id, AGORA))?.conta).toBe('Loja Falsa 1');
  });
});

describe('"OK para responder no ML"', () => {
  it('lista código, pedidos, reclamação e conta; marcar limpa a pendência e registra quem respondeu', async () => {
    await contasFalsasTeste(db);
    const d = await conferidaBom();
    await db.insert(reclamacoesMl).values({ claimId: d.externa!.reclamacaoId, devolucaoId: d.id, conta: 'loja-falsa-1', sincronizadaEm: AGORA });
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    expect(await listarOkPendentes(db, AGORA)).toEqual([
      expect.objectContaining({ devolucaoId: d.id, codigo: d.codigo, reclamacaoId: d.externa!.reclamacaoId, conta: 'Loja Falsa 1', pedidos: d.externa!.pedidos }),
    ]);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await marcarOkRespondido(db, d.id, gestor, AGORA, BB);
    expect(await listarOkPendentes(db, AGORA)).toEqual([]);
    expect((await listarEventos(db, 'devolucao', d.id)).find((e) => e.acao === 'ml_ok_respondido_a_mao')?.usuarioNome).toBe(gestor.nome);
    await expect(marcarOkRespondido(db, d.id, gestor, AGORA, BB)).rejects.toThrow('não tem "OK" para responder');
  });

  it('contarRespostasParaDarNoML: OK pendentes + contestações AGUARDANDO_GESTOR ou FALHOU (ENVIADA não conta)', async () => {
    const ok = await conferidaBom();
    await processarResultadoConferencia(db, ok.id, AGORA, BB);
    const aguardando = await conferidaProblema();
    await processarResultadoConferencia(db, aguardando.id, AGORA, BB);
    const respondida = await conferidaProblema();
    await processarResultadoConferencia(db, respondida.id, AGORA, BB);
    await marcarContestacaoRespondida(db, (await contestacaoDe(respondida.id)).id, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    expect(await contarRespostasParaDarNoML(db)).toBe(2);
  });
});

describe('envio automático desligado no modo bitbrain', () => {
  it('revisarEEnviar é recusado e nada entra na fila', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const fila = new FilaMemoria();
    const c = await contestacaoDe(d.id);
    const pedido = revisarEEnviar(db, fila, c.id, { motivo: 'SRF6', mensagem: 'Mensagem de teste longa.', evidencias: [] }, await criarUsuarioTeste(db, 'GESTOR'), AGORA, BB);
    await expect(pedido).rejects.toThrow('Marcar como respondida');
    expect(fila.enviadas).toEqual([]);
  });

  it('enviarContestacao: FALHOU com "responda no ML à mão", sem chamar o ML', async () => {
    const d = await conferidaProblema();
    await processarResultadoConferencia(db, d.id, AGORA, BB);
    const c = await contestacaoDe(d.id);
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await db.update(contestacoesCanal).set({ revisadoPor: gestor.id }).where(eq(contestacoesCanal.id, c.id));
    expect(await enviarContestacao(db, c.id, { agora: AGORA, ultimaTentativa: false, config: BB })).toBe('falhou');
    expect(await contestacaoDe(d.id)).toMatchObject({ status: 'FALHOU', erro: expect.stringContaining('responda no ML à mão') });
    expect(conector.enviados).toEqual([]);
  });

  it('pelo manipulador do worker (configML do ambiente): o modo bitbrain também vale', async () => {
    usarModoBitbrain();
    const d = await conferidaBom();
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_pendente_manual');
  });
});
