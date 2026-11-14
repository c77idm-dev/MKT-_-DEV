import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eventosHistorico, evidencias } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarNaoIdentificada } from '@/modules/devolucoes/recebimento';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterArmazenamento } from './armazenamento';
import type { ArmazenamentoMemoria } from './armazenamento-memoria';
import { autorizarEnvio, registrarRecebida, type MetadadosEnvio } from './recepcao';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

function meta(devolucaoId: string, extra: Partial<MetadadosEnvio> = {}): MetadadosEnvio {
  return { idCliente: randomUUID(), devolucaoId, itemId: null, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg', nome: 'foto.jpg', ...extra };
}

describe('autorizarEnvio', () => {
  it('quem está conferindo manda qualquer evidência; Fotos 3 e 4 precisam da unidade desta devolução', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const outra = await criarDevolucaoEmConferencia(db, operador);
    await expect(autorizarEnvio(db, meta(d.id), 1000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/quicktime' }), 50_000_000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'FOTO_3_PRODUTO', itemId: d.itens[0] }), 1000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'FOTO_3_PRODUTO' }), 1000, operador)).rejects.toMatchObject({ status: 400 });
    await expect(autorizarEnvio(db, meta(d.id, { tipo: 'FOTO_4_CODIGO_SERIAL', itemId: outra.itens[0] }), 1000, operador)).rejects.toMatchObject({
      status: 400,
      message: 'A unidade não é desta devolução.',
    });
  });

  it('recusa tamanho, tipo de arquivo, perfil e quem não está com a trava', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(autorizarEnvio(db, meta(d.id), 16 * 1024 * 1024, operador)).rejects.toMatchObject({ status: 413 });
    await expect(autorizarEnvio(db, meta(d.id, { tipoConteudo: 'image/heic' }), 1000, operador)).rejects.toMatchObject({ status: 415 });
    await expect(autorizarEnvio(db, meta(d.id), undefined, operador)).rejects.toMatchObject({ status: 400 });
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(autorizarEnvio(db, meta(d.id), 1000, fiscal)).rejects.toMatchObject({ status: 403 });
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(autorizarEnvio(db, meta(d.id), 1000, outro)).rejects.toMatchObject({ status: 409 });
  });

  it('no Recebimento: Fotos 1 e 2 do pacote não identificado (spec §6.2), e só elas', async () => {
    const ni = await criarNaoIdentificada(db, 'BRNI0002', operador);
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(autorizarEnvio(db, meta(ni.id, { tipo: 'FOTO_2_EMBALAGEM' }), 1000, outro)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(ni.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/mp4' }), 1000, outro)).rejects.toMatchObject({ status: 409 });
  });
});

describe('registrarRecebida', () => {
  it('grava a evidência RECEBIDA, o evento e a tarefa de processamento na mesma transação', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const m = meta(d.id);
    const r = await registrarRecebida(db, { meta: m, caminhoTemporario: '/tmp/tus/a', tamanho: 1234, sha256: 'b'.repeat(64), usuario: operador });
    expect(r.repetida).toBe(false);
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, r.evidenciaId));
    expect(e).toMatchObject({
      tipo: 'FOTO_1_ETIQUETA',
      situacaoProcessamento: 'RECEBIDA',
      caminhoTemporario: '/tmp/tus/a',
      tamanhoOriginal: 1234,
      sha256Original: 'b'.repeat(64),
      idCliente: m.idCliente,
      enviadoPor: operador.id,
    });
    expect(fila.enviadas).toEqual([
      { nome: 'midia.processar-foto', dados: { evidenciaId: r.evidenciaId }, opcoes: { tx: expect.anything(), chaveUnica: r.evidenciaId } },
    ]);
    const [evento] = await db.select({ dados: eventosHistorico.dados }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_enviada'));
    expect(evento.dados).toEqual({ evidenciaId: r.evidenciaId, tipo: 'FOTO_1_ETIQUETA', itemId: null, sha256_original: 'b'.repeat(64) });
  });

  it('o mesmo envio de novo devolve a mesma evidência, sem gravar outra', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const m = meta(d.id);
    const base = { meta: m, caminhoTemporario: '/tmp/tus/b', tamanho: 10, sha256: 'c'.repeat(64), usuario: operador };
    const primeira = await registrarRecebida(db, base);
    expect(await registrarRecebida(db, base)).toEqual({ evidenciaId: primeira.evidenciaId, repetida: true });
    expect(fila.enviadas).toHaveLength(1);
  });

  it('refazer a Foto 1 apaga a anterior (linha e arquivo) e guarda os dois hashes (contrato D6)', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const armazenamento = obterArmazenamento() as ArmazenamentoMemoria;
    await armazenamento.salvar('evidencias/antiga.jpg', Readable.from([Buffer.from('x')]));
    const antiga = await criarEvidenciaTeste(db, {
      devolucaoId: d.id,
      tipo: 'FOTO_1_ETIQUETA',
      situacao: 'PRONTA',
      caminho: 'evidencias/antiga.jpg',
      provedor: 'memoria',
      sha256Original: 'd'.repeat(64),
    });
    const r = await registrarRecebida(db, { meta: meta(d.id), caminhoTemporario: '/tmp/tus/c', tamanho: 10, sha256: 'e'.repeat(64), usuario: operador });
    expect(await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.devolucaoId, d.id))).toEqual([{ id: r.evidenciaId }]);
    expect(armazenamento.arquivos.has('evidencias/antiga.jpg')).toBe(false);
    const [evento] = await db.select({ dados: eventosHistorico.dados }).from(eventosHistorico).where(eq(eventosHistorico.acao, 'evidencia_refeita'));
    expect(evento.dados).toMatchObject({ evidenciaAnteriorId: antiga, sha256_original_anterior: 'd'.repeat(64), sha256_original: 'e'.repeat(64) });
  });

  it('o Vídeo de Prova vai para a transcodificação', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const r = await registrarRecebida(db, {
      meta: meta(d.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/mp4' }),
      caminhoTemporario: '/tmp/tus/v',
      tamanho: 10,
      sha256: 'f'.repeat(64),
      usuario: operador,
    });
    expect(fila.enviadas[0]).toMatchObject({ nome: 'midia.transcodificar', dados: { evidenciaId: r.evidenciaId } });
  });
});
