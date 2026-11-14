import { existsSync } from 'node:fs';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eventosHistorico, evidencias, importacoes } from '@/db/schema';
import { criarFilas, criarPgBoss, enviarPorPgBoss } from '@/modules/fila/fila';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas, urlBancoTeste } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { limparTemporarios } from './limpeza';

const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T03:30:00Z');
const doisDiasAntes = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000);

const SCHEMA_FILA_TESTE = 'pgboss_limpeza_int';
let boss: PgBoss;
beforeAll(async () => {
  boss = criarPgBoss(urlBancoTeste(), { max: 2, supervisionar: false, schema: SCHEMA_FILA_TESTE });
  await boss.start();
  await criarFilas(boss);
}, 60_000);

beforeEach(async () => {
  await boss.deleteAllJobs();
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'limpeza-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await boss.stop({ graceful: false });
  await sql.unsafe(`drop schema if exists ${SCHEMA_FILA_TESTE} cascade`);
  await sql.end();
});

async function arquivo(nome: string, quando: Date) {
  const caminho = join(pasta, nome);
  await writeFile(caminho, 'x');
  await utimes(caminho, quando, quando);
  return caminho;
}

describe('limparTemporarios (extra: tarefa diária limpeza.temporarios)', () => {
  it('apaga uploads abandonados há mais de 1 dia e mantém os em uso e os recentes', async () => {
    const abandonado = await arquivo('aaa', doisDiasAntes);
    const abandonadoJson = await arquivo('aaa.json', doisDiasAntes);
    const emUso = await arquivo('bbb', doisDiasAntes);
    const recente = await arquivo('ccc', agora);
    const d = await criarDevolucaoEmConferencia(db, operador);
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA', caminhoTemporario: emUso });

    const r = await limparTemporarios(db, { agora, pasta });
    expect(r.arquivos).toBe(2);
    expect([existsSync(abandonado), existsSync(abandonadoJson), existsSync(emUso), existsSync(recente)]).toEqual([false, false, true, true]);
  });

  it('apaga importações de planilha não confirmadas há mais de 1 dia', async () => {
    const base = { tipo: 'produtos' as const, nomeArquivo: 'p.csv', cabecalhos: [], linhas: [], criadoPor: operador.id };
    await db.insert(importacoes).values([{ ...base, criadaEm: doisDiasAntes }, { ...base, criadaEm: agora }]);
    expect((await limparTemporarios(db, { agora, pasta })).importacoes).toBe(1);
    expect(await db.select({ id: importacoes.id }).from(importacoes)).toHaveLength(1);
  });

  it('pasta que ainda não existe não é erro', async () => {
    expect(await limparTemporarios(db, { agora, pasta: join(pasta, 'nao-existe') })).toEqual({ arquivos: 0, importacoes: 0, interrompidas: 0 });
  });

  it('marca FALHOU a evidência presa há mais de 1 dia sem job vivo, com o evento; mantém as com job e as recentes', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const presa = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', situacao: 'PROCESSANDO' });
    const presaVideo = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA', situacao: 'RECEBIDA' });
    const comJob = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM', situacao: 'RECEBIDA' });
    const d2 = await criarDevolucaoEmConferencia(db, operador);
    const recente = await criarEvidenciaTeste(db, { devolucaoId: d2.id, tipo: 'FOTO_1_ETIQUETA', situacao: 'RECEBIDA' });
    for (const id of [presa, presaVideo, comJob]) await db.update(evidencias).set({ enviadoEm: doisDiasAntes }).where(eq(evidencias.id, id));
    await enviarPorPgBoss(boss, 'midia.processar-foto', { evidenciaId: comJob }, { chaveUnica: comJob });

    const r = await limparTemporarios(db, { agora, pasta, schemaFila: SCHEMA_FILA_TESTE });
    expect(r.interrompidas).toBe(2);
    const linha = async (id: string) => (await db.select().from(evidencias).where(eq(evidencias.id, id)))[0];
    expect(await linha(presa)).toMatchObject({ situacaoProcessamento: 'FALHOU', erroProcessamento: 'Processamento interrompido.' });
    expect(await linha(presaVideo)).toMatchObject({ situacaoProcessamento: 'FALHOU' });
    expect((await linha(comJob)).situacaoProcessamento).toBe('RECEBIDA');
    expect((await linha(recente)).situacaoProcessamento).toBe('RECEBIDA');
    expect(await db.select({ id: eventosHistorico.id }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_falhou'))).toHaveLength(2);
  });
});
