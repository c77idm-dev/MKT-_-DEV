import { existsSync } from 'node:fs';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importacoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { limparTemporarios } from './limpeza';

const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T03:30:00Z');
const doisDiasAntes = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000);

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'limpeza-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
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
    expect(await limparTemporarios(db, { agora, pasta: join(pasta, 'nao-existe') })).toEqual({ arquivos: 0, importacoes: 0 });
  });
});
