import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventosHistorico, evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { sha256DoBuffer } from './hash';
import { processarFoto } from './processamento';

const { db, sql } = criarDbTeste();
let pasta: string;
let operador: UsuarioSessao;
const agora = new Date('2026-11-12T18:00:00Z');

beforeEach(async () => {
  await limparTabelas(sql);
  pasta = await mkdtemp(join(tmpdir(), 'proc-'));
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

async function fotoRecebida(conteudo?: Buffer) {
  const d = await criarDevolucaoEmConferencia(db, operador);
  const caminho = join(pasta, 'upload1');
  await writeFile(caminho, conteudo ?? (await sharp({ create: { width: 640, height: 480, channels: 3, background: '#88aa99' } }).jpeg().toBuffer()));
  await writeFile(`${caminho}.json`, '{}');
  const id = await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', caminhoTemporario: caminho, usuarioId: operador.id });
  return { d, id, caminho };
}
async function linha(id: string) {
  const [e] = await db.select().from(evidencias).where(eq(evidencias.id, id));
  return e;
}

describe('processarFoto (tarefa midia.processar-foto)', () => {
  it('carimba, guarda no armazenamento final, marca PRONTA com os hashes e apaga o temporário', async () => {
    const { d, id, caminho } = await fotoRecebida();
    await processarFoto(db, id, { tentativa: 1, agora });
    const e = await linha(id);
    const chave = `evidencias/${d.id}/${id}.jpg`;
    const guardado = (obterArmazenamento() as ArmazenamentoMemoria).arquivos.get(chave);
    expect(guardado?.tipoConteudo).toBe('image/jpeg');
    expect(e).toMatchObject({
      situacaoProcessamento: 'PRONTA',
      caminho: chave,
      provedor: 'memoria',
      caminhoTemporario: null,
      tamanho: guardado!.conteudo.length,
      sha256Final: sha256DoBuffer(guardado!.conteudo),
      processadoEm: agora,
    });
    expect(existsSync(caminho) || existsSync(`${caminho}.json`)).toBe(false);
    const [evento] = await db.select({ dados: eventosHistorico.dados }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_processada'));
    expect(evento.dados).toMatchObject({ evidenciaId: id, tipo: 'FOTO_1_ETIQUETA', sha256_final: e.sha256Final });
  });

  it('idempotente: evidência apagada (refeita) ou já pronta não faz nada', async () => {
    const { id } = await fotoRecebida();
    await processarFoto(db, id, { tentativa: 1, agora });
    await processarFoto(db, id, { tentativa: 1, agora });
    await db.delete(evidencias).where(eq(evidencias.id, id));
    await expect(processarFoto(db, id, { tentativa: 1, agora })).resolves.toBeUndefined();
  });

  it('erro numa tentativa intermediária: volta para RECEBIDA e lança (nova tentativa)', async () => {
    const { id } = await fotoRecebida(Buffer.from('não é imagem'));
    await expect(processarFoto(db, id, { tentativa: 2, agora })).rejects.toThrow();
    expect(await linha(id)).toMatchObject({ situacaoProcessamento: 'RECEBIDA' });
  });

  it('erro na 5ª tentativa: FALHOU, com o motivo e o evento evidencia_falhou (decisão 8)', async () => {
    const { id } = await fotoRecebida(Buffer.from('não é imagem'));
    await expect(processarFoto(db, id, { tentativa: 5, agora })).rejects.toThrow();
    const e = await linha(id);
    expect(e.situacaoProcessamento).toBe('FALHOU');
    expect(e.erroProcessamento).toBeTruthy();
    expect(await db.select({ id: eventosHistorico.id }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_falhou'))).toHaveLength(1);
  });
});
