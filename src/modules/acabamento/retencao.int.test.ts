import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { evidencias, importacoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { definirArmazenamentoParaTestes } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { salvarConfiguracaoMidia } from '@/modules/midia/configuracao';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarContestacaoTeste, criarDevolucaoConcluidaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import { aplicarRetencao, limparLinhasImportacoes } from './retencao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2027-12-01T12:00:00Z');
const HA_13_MESES = new Date('2026-11-01T12:00:00Z');
const HA_2_MESES = new Date('2027-10-01T12:00:00Z');
let armazenamento: ArmazenamentoMemoria;
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  armazenamento = new ArmazenamentoMemoria();
  definirArmazenamentoParaTestes(armazenamento);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(() => sql.end());

/** Devolução concluída com a Foto 1 e o Vídeo de Prova já no armazenamento. */
async function concluidaComMidias(concluidaEm: Date, unidades: Parameters<typeof criarDevolucaoConcluidaTeste>[2]['unidades'] = [{ destino: 'BOM' }]) {
  const dev = await criarDevolucaoConcluidaTeste(db, operador, { concluidaEm, unidades });
  const caminhos: string[] = [];
  for (const tipo of ['FOTO_1_ETIQUETA', 'VIDEO_PROVA'] as const) {
    const caminho = `evidencias/${dev.id}/${randomUUID()}.${tipo === 'VIDEO_PROVA' ? 'mp4' : 'jpg'}`;
    await armazenamento.salvar(caminho, Readable.from(Buffer.from('conteudo')));
    await criarEvidenciaTeste(db, { devolucaoId: dev.id, tipo, situacao: 'PRONTA', caminho, provedor: 'memoria' });
    caminhos.push(caminho);
  }
  return { dev, caminhos };
}

async function situacoes(devolucaoId: string) {
  return (await db.select({ s: evidencias.situacaoProcessamento }).from(evidencias).where(eq(evidencias.devolucaoId, devolucaoId))).map((l) => l.s);
}

describe('midia.retencao (spec §9)', () => {
  it('apaga as mídias de devolução CONCLUIDA há mais de 12 meses e guarda os hashes', async () => {
    const { dev, caminhos } = await concluidaComMidias(HA_13_MESES);
    expect(await aplicarRetencao(db, { agora: AGORA })).toEqual({ devolucoes: 1, evidencias: 2 });
    for (const c of caminhos) expect(await armazenamento.existe(c)).toBe(false);
    const linhas = await db.select().from(evidencias).where(eq(evidencias.devolucaoId, dev.id));
    expect(linhas.map((l) => [l.situacaoProcessamento, l.caminho, l.sha256Original])).toEqual([
      ['APAGADA', null, 'a'.repeat(64)],
      ['APAGADA', null, 'a'.repeat(64)],
    ]);
    const eventos = await listarEventos(db, 'devolucao', dev.id);
    expect(eventos.filter((e) => e.acao === 'midia_apagada_retencao').map((e) => e.dados)).toEqual([{ evidencias: 2 }]);
  });

  it('respeita o prazo configurado pelo Gestor (meses_retencao_midia)', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { dev } = await concluidaComMidias(HA_2_MESES);
    expect((await aplicarRetencao(db, { agora: AGORA })).devolucoes).toBe(0);
    await salvarConfiguracaoMidia(db, { videoObrigatorio: 'SEMPRE', mesesRetencaoMidia: 1 }, gestor);
    expect((await aplicarRetencao(db, { agora: AGORA })).devolucoes).toBe(1);
    expect(await situacoes(dev.id)).toEqual(['APAGADA', 'APAGADA']);
  });

  it('nunca apaga com lote não FINALIZADO, unidade PROBLEMA não resolvida ou contestação pendente; apaga quando tudo terminou', async () => {
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const problema = [{ destino: 'PROBLEMA' as const, motivo: 'AVARIADO' as const }];
    const noLoteAberto = await concluidaComMidias(HA_13_MESES, problema);
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'ABERTO' });
    await db.update(itensDevolucao).set({ status: 'EM_LOTE', loteId: lote.id }).where(eq(itensDevolucao.id, noLoteAberto.dev.itens[0].id));
    const semFornecedor = await concluidaComMidias(HA_13_MESES, problema);
    await db.update(itensDevolucao).set({ status: 'SEM_FORNECEDOR' }).where(eq(itensDevolucao.id, semFornecedor.dev.itens[0].id));
    const aguardandoGestor = await concluidaComMidias(HA_13_MESES);
    await criarContestacaoTeste(db, aguardandoGestor.dev.id, { status: 'AGUARDANDO_GESTOR', prazo: null });
    const falhou = await concluidaComMidias(HA_13_MESES);
    await criarContestacaoTeste(db, falhou.dev.id, { status: 'FALHOU', prazo: null });
    // D11: unidade PROBLEMA que ficou em AGUARDANDO_NF numa devolução CONCLUIDA (a fábrica a deixa assim).
    const problemaSemLote = await concluidaComMidias(HA_13_MESES, problema);

    const terminada = await concluidaComMidias(HA_13_MESES, problema);
    const finalizado = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'FINALIZADO', tipo: 'CONSERTO' });
    await db
      .update(itensDevolucao)
      .set({ status: 'RESOLVIDO', loteId: finalizado.id, resultadoFornecedor: 'CONSERTADO' })
      .where(eq(itensDevolucao.id, terminada.dev.itens[0].id));
    await criarContestacaoTeste(db, terminada.dev.id, { status: 'ENVIADA', prazo: null });

    expect(await aplicarRetencao(db, { agora: AGORA })).toEqual({ devolucoes: 1, evidencias: 2 });
    for (const d of [noLoteAberto, semFornecedor, aguardandoGestor, falhou, problemaSemLote]) expect(await situacoes(d.dev.id)).toEqual(['PRONTA', 'PRONTA']);
    expect(await situacoes(terminada.dev.id)).toEqual(['APAGADA', 'APAGADA']);
  });

  it('não mexe em devolução recente nem em quem não está CONCLUIDA', async () => {
    const recente = await concluidaComMidias(HA_2_MESES);
    const reaberta = await concluidaComMidias(HA_13_MESES);
    await sql`update devolucoes set status = 'AGUARDANDO_NF' where id = ${reaberta.dev.id}`; // sql = cliente postgres.js do teste
    expect((await aplicarRetencao(db, { agora: AGORA })).devolucoes).toBe(0);
    expect(await situacoes(recente.dev.id)).toEqual(['PRONTA', 'PRONTA']);
  });

  it('arquivo que já sumiu não é erro, e a segunda rodada não faz nada', async () => {
    const { dev, caminhos } = await concluidaComMidias(HA_13_MESES);
    await armazenamento.apagar(caminhos[0]);
    expect((await aplicarRetencao(db, { agora: AGORA })).evidencias).toBe(2);
    expect(await aplicarRetencao(db, { agora: AGORA })).toEqual({ devolucoes: 0, evidencias: 0 });
    expect(await situacoes(dev.id)).toEqual(['APAGADA', 'APAGADA']);
  });

  it('apaga também o arquivo temporário de uma evidência que falhou', async () => {
    const dev = await criarDevolucaoConcluidaTeste(db, operador, { concluidaEm: HA_13_MESES, unidades: [{ destino: 'BOM' }] });
    const temporario = join(mkdtempSync(join(tmpdir(), 'retencao-')), 'upload');
    writeFileSync(temporario, 'x');
    await criarEvidenciaTeste(db, { devolucaoId: dev.id, tipo: 'VIDEO_PROVA', situacao: 'FALHOU', caminhoTemporario: temporario });
    expect((await aplicarRetencao(db, { agora: AGORA })).evidencias).toBe(1);
    expect(existsSync(temporario)).toBe(false);
  });

  it('trabalha em rodadas e para no tempo máximo (decisão 7e)', async () => {
    for (let i = 0; i < 3; i++) await concluidaComMidias(HA_13_MESES);
    expect((await aplicarRetencao(db, { agora: AGORA, rodada: 2, tempoMaximoMs: 0 })).devolucoes).toBe(2);
    expect((await aplicarRetencao(db, { agora: AGORA, rodada: 2 })).devolucoes).toBe(1);
  });
});

describe('linhas das importações (LGPD, decisão 8)', () => {
  it('importação CONCLUIDA há mais de 30 dias perde as linhas e guarda o resumo; as outras ficam', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const base = { tipo: 'devolucoes' as const, nomeArquivo: 'p.xlsx', cabecalhos: ['nome do comprador'], linhas: [['Maria']], criadoPor: gestor.id };
    const [velha] = await db.insert(importacoes).values({ ...base, situacao: 'CONCLUIDA', resumo: { criados: 1 } as never, concluidaEm: new Date('2027-10-01T00:00:00Z') }).returning();
    const [nova] = await db.insert(importacoes).values({ ...base, situacao: 'CONCLUIDA', concluidaEm: new Date('2027-11-25T00:00:00Z') }).returning();
    const [pendente] = await db.insert(importacoes).values({ ...base, criadaEm: new Date('2027-01-01T00:00:00Z') }).returning();
    expect(await limparLinhasImportacoes(db, AGORA)).toBe(1);
    const linhas = async (id: string) => (await db.select({ l: importacoes.linhas, r: importacoes.resumo }).from(importacoes).where(and(eq(importacoes.id, id))))[0];
    expect(await linhas(velha.id)).toEqual({ l: [], r: { criados: 1 } });
    expect((await linhas(nova.id)).l).toEqual([['Maria']]);
    expect((await linhas(pendente.id)).l).toEqual([['Maria']]); // a PENDENTE é da limpeza.temporarios (Fase 2)
  });
});
