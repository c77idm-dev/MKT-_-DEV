import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evidencias, itensRetiradaFull, retiradasFull } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { montarQuadro } from '@/modules/devolucoes/quadro';
import { receberPorRastreio } from '@/modules/devolucoes/recebimento';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import type { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { processarFoto } from '@/modules/midia/processamento';
import { autorizarEnvio, registrarRecebida, type MetadadosEnvio } from '@/modules/midia/recepcao';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { listarRetiradas, obterRetirada } from './consultas';
import { ErroRetirada } from './erros';
import { alterarQuantidade, biparProduto, concluirRetirada, criarRetirada, removerItem } from './retiradas';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let pasta: string;

beforeEach(async () => {
  await limparTabelas(sql);
  definirFilaParaTestes(new FilaMemoria());
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  pasta = await mkdtemp(join(tmpdir(), 'rf-'));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});
afterAll(async () => {
  await sql.end();
});

function meta(retiradaId: string, extra: Partial<MetadadosEnvio> = {}): MetadadosEnvio {
  return { idCliente: randomUUID(), devolucaoId: null, retiradaId, itemId: null, tipo: 'FOTO_1_ETIQUETA', tipoConteudo: 'image/jpeg', nome: 'foto.jpg', ...extra };
}

async function fotoNoDisco(nome: string): Promise<string> {
  const caminho = join(pasta, nome);
  await writeFile(caminho, await sharp({ create: { width: 320, height: 240, channels: 3, background: '#88aa99' } }).jpeg().toBuffer());
  return caminho;
}

async function enviarFoto(retiradaId: string, extra: Partial<MetadadosEnvio> = {}) {
  const caminho = await fotoNoDisco(randomUUID());
  return registrarRecebida(db, { meta: meta(retiradaId, extra), caminhoTemporario: caminho, tamanho: 1000, sha256: 'b'.repeat(64), usuario: operador });
}

async function itensDe(retiradaId: string) {
  return db.select().from(itensRetiradaFull).where(eq(itensRetiradaFull.retiradaId, retiradaId));
}

describe('criarRetirada', () => {
  it('nasce de um código não encontrado no Recebimento: RF-000001, Aberta, com quem recebeu e o histórico', async () => {
    expect(await receberPorRastreio(db, 'FULL123', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: 'FULL123' });
    const agora = new Date('2026-11-16T12:00:00Z');
    const r = await criarRetirada(db, ' full 123 ', operador, agora);
    expect(r).toMatchObject({ codigo: 'RF-000001', nova: true });
    const [linha] = await db.select().from(retiradasFull).where(eq(retiradasFull.id, r.id));
    expect(linha).toMatchObject({ codigoEtiqueta: 'FULL123', situacao: 'ABERTA', recebidaPor: operador.id, recebidaEm: agora, concluidaEm: null });
    expect((await listarEventos(db, 'retirada_full', r.id)).map((e) => [e.acao, e.para, e.usuarioNome])).toEqual([
      ['retirada_full_criada', 'ABERTA', operador.nome],
    ]);
  });

  it('a mesma etiqueta com uma retirada aberta devolve a mesma (toque duplo não cria duas)', async () => {
    const [a, b] = await Promise.all([criarRetirada(db, 'FULL9', operador), criarRetirada(db, 'FULL9', operador)]);
    expect(a.id).toBe(b.id);
    expect([a.nova, b.nova].sort()).toEqual([false, true]);
    expect(await db.select().from(retiradasFull)).toHaveLength(1);
  });

  it('recusa etiqueta vazia e o perfil Fiscal', async () => {
    await expect(criarRetirada(db, '   ', operador)).rejects.toThrow(new ErroRetirada('Leia ou digite o código da etiqueta.'));
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(criarRetirada(db, 'FULL1', fiscal)).rejects.toBeInstanceOf(ErroRetirada);
  });
});

describe('biparProduto, alterarQuantidade e removerItem', () => {
  it('EAN do cadastro soma no mesmo item; EAN sem cadastro pede descrição uma vez só', async () => {
    const produtoId = await criarProdutoTeste(db, { ean: '7891000000014', descricao: 'Fone Bluetooth' });
    const r = await criarRetirada(db, 'FULL1', operador);
    const primeiro = await biparProduto(db, r.id, '7891000000014', null, operador);
    expect(primeiro.tipo).toBe('somado');
    await biparProduto(db, r.id, '0007891000000014', null, operador);
    expect(await biparProduto(db, r.id, '555', null, operador)).toEqual({ tipo: 'pedir_descricao', ean: '555' });
    await expect(biparProduto(db, r.id, '555', '   ', operador)).rejects.toBeInstanceOf(ErroRetirada);
    await biparProduto(db, r.id, '555', 'Cabo USB-C', operador);
    expect(await biparProduto(db, r.id, ' 555 ', null, operador)).toMatchObject({ tipo: 'somado' });

    const itens = await itensDe(r.id);
    expect(itens.map((i) => [i.produtoId, i.descricao, i.quantidade]).sort()).toEqual(
      [
        [produtoId, null, 2],
        [null, 'Cabo USB-C', 2],
      ].sort(),
    );
    const acoes = (await listarEventos(db, 'retirada_full', r.id)).map((e) => e.acao);
    expect(acoes.filter((a) => a === 'retirada_full_item_incluido')).toHaveLength(2);
    expect(acoes.filter((a) => a === 'retirada_full_quantidade_alterada')).toHaveLength(2);

    const detalhe = await obterRetirada(db, r.codigo);
    expect(detalhe?.itens.find((i) => i.semCadastro)).toMatchObject({ descricao: 'Cabo USB-C', eanLido: '555', quantidade: 2, sku: null });
    expect(detalhe?.itens.find((i) => !i.semCadastro)).toMatchObject({ descricao: 'Fone Bluetooth', quantidade: 2 });
  });

  it('− para em 1, + soma, e remover tira o item, a foto dele e o arquivo', async () => {
    const r = await criarRetirada(db, 'FULL2', operador);
    await biparProduto(db, r.id, '123', 'Capinha', operador);
    const [item] = await itensDe(r.id);
    await alterarQuantidade(db, r.id, item.id, 1, operador);
    await alterarQuantidade(db, r.id, item.id, -1, operador);
    await alterarQuantidade(db, r.id, item.id, -1, operador);
    expect((await itensDe(r.id))[0].quantidade).toBe(1);

    const { evidenciaId } = await enviarFoto(r.id, { tipo: 'FOTO_3_PRODUTO', itemId: item.id });
    await processarFoto(db, evidenciaId, { tentativa: 1, agora: new Date() });
    const armazenamento = obterArmazenamento() as ArmazenamentoMemoria;
    expect(armazenamento.arquivos.size).toBe(1);

    await removerItem(db, r.id, item.id, operador);
    expect(await itensDe(r.id)).toHaveLength(0);
    expect(await db.select().from(evidencias).where(eq(evidencias.id, evidenciaId))).toHaveLength(0);
    expect(armazenamento.arquivos.size).toBe(0);
    expect((await listarEventos(db, 'retirada_full', r.id)).map((e) => e.acao)).toContain('retirada_full_item_removido');
  });

  it('item de outra retirada é recusado', async () => {
    const a = await criarRetirada(db, 'FULLA', operador);
    const b = await criarRetirada(db, 'FULLB', operador);
    await biparProduto(db, a.id, '123', 'Capinha', operador);
    const [item] = await itensDe(a.id);
    await expect(alterarQuantidade(db, b.id, item.id, 1, operador)).rejects.toBeInstanceOf(ErroRetirada);
    await expect(removerItem(db, b.id, item.id, operador)).rejects.toBeInstanceOf(ErroRetirada);
    // Id que não é UUID (vindo da tela) vira mensagem, não erro do banco.
    await expect(alterarQuantidade(db, 'x', item.id, 1, operador)).rejects.toThrow('Retirada não encontrada.');
    await expect(removerItem(db, a.id, 'x', operador)).rejects.toThrow('Item não encontrado nesta retirada.');
  });
});

describe('concluirRetirada', () => {
  it('sem foto da etiqueta ou sem item é recusado; com os dois fica Conferida e só leitura', async () => {
    const r = await criarRetirada(db, 'FULL3', operador);
    await expect(concluirRetirada(db, r.id, operador)).rejects.toThrow('Tire a foto da etiqueta. Bipe pelo menos 1 produto.');
    await enviarFoto(r.id);
    await expect(concluirRetirada(db, r.id, operador)).rejects.toThrow('Bipe pelo menos 1 produto.');
    await biparProduto(db, r.id, '123', 'Capinha', operador);
    const agora = new Date('2026-11-16T13:00:00Z');
    await concluirRetirada(db, r.id, operador, agora);
    const [linha] = await db.select().from(retiradasFull).where(eq(retiradasFull.id, r.id));
    expect(linha).toMatchObject({ situacao: 'CONFERIDA', concluidaEm: agora });
    expect((await listarEventos(db, 'retirada_full', r.id)).at(-1)).toMatchObject({ acao: 'retirada_full_concluida', de: 'ABERTA', para: 'CONFERIDA' });

    const [item] = await itensDe(r.id);
    const mensagem = 'Esta retirada já foi conferida.';
    await expect(biparProduto(db, r.id, '123', null, operador)).rejects.toThrow(mensagem);
    await expect(alterarQuantidade(db, r.id, item.id, 1, operador)).rejects.toThrow(mensagem);
    await expect(removerItem(db, r.id, item.id, operador)).rejects.toThrow(mensagem);
    await expect(concluirRetirada(db, r.id, operador)).rejects.toThrow(mensagem);
    await expect(autorizarEnvio(db, meta(r.id), 1000, operador)).rejects.toMatchObject({ status: 409 });
  });

  it('foto da etiqueta que falhou no servidor não conta', async () => {
    const r = await criarRetirada(db, 'FULL4', operador);
    await biparProduto(db, r.id, '123', 'Capinha', operador);
    const { evidenciaId } = await enviarFoto(r.id);
    await db.update(evidencias).set({ situacaoProcessamento: 'FALHOU' }).where(eq(evidencias.id, evidenciaId));
    await expect(concluirRetirada(db, r.id, operador)).rejects.toThrow('Tire a foto da etiqueta.');
  });

  it('o Fiscal não bipa nem conclui', async () => {
    const r = await criarRetirada(db, 'FULL5', operador);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(biparProduto(db, r.id, '123', 'Capinha', fiscal)).rejects.toBeInstanceOf(ErroRetirada);
    await expect(concluirRetirada(db, r.id, fiscal)).rejects.toBeInstanceOf(ErroRetirada);
    await expect(autorizarEnvio(db, meta(r.id), 1000, fiscal)).rejects.toMatchObject({ status: 403 });
  });
});

describe('fotos da retirada pelo mesmo envio das evidências', () => {
  it('registra no dono certo, processa com o carimbo do código RF e grava o histórico da retirada', async () => {
    const r = await criarRetirada(db, 'FULL6', operador);
    const { evidenciaId } = await enviarFoto(r.id);
    await processarFoto(db, evidenciaId, { tentativa: 1, agora: new Date() });
    const [e] = await db.select().from(evidencias).where(eq(evidencias.id, evidenciaId));
    expect(e).toMatchObject({ devolucaoId: null, retiradaId: r.id, itemRetiradaId: null, situacaoProcessamento: 'PRONTA' });
    expect(e.caminho).toBe(`evidencias/${r.id}/${evidenciaId}.jpg`);
    expect((await listarEventos(db, 'retirada_full', r.id)).map((x) => x.acao)).toEqual([
      'retirada_full_criada',
      'evidencia_enviada',
      'evidencia_processada',
    ]);
    // Refazer a foto da etiqueta troca a anterior.
    const refeita = await enviarFoto(r.id);
    expect(await db.select().from(evidencias).where(eq(evidencias.retiradaId, r.id))).toHaveLength(1);
    expect(refeita.repetida).toBe(false);
    const detalhe = await obterRetirada(db, r.codigo);
    expect(detalhe?.evidencias).toHaveLength(1);
  });

  it('recusa vídeo, Foto 2 e a foto de um item de outra retirada', async () => {
    const a = await criarRetirada(db, 'FULL7', operador);
    const b = await criarRetirada(db, 'FULL8', operador);
    await biparProduto(db, b.id, '123', 'Capinha', operador);
    const [itemB] = await itensDe(b.id);
    await expect(autorizarEnvio(db, meta(a.id, { tipo: 'VIDEO_PROVA', tipoConteudo: 'video/mp4' }), 1000, operador)).rejects.toMatchObject({ status: 400 });
    await expect(autorizarEnvio(db, meta(a.id, { tipo: 'FOTO_2_EMBALAGEM' }), 1000, operador)).rejects.toMatchObject({ status: 400 });
    await expect(autorizarEnvio(db, meta(a.id, { tipo: 'FOTO_3_PRODUTO', itemId: itemB.id }), 1000, operador)).rejects.toMatchObject({
      status: 400,
      message: 'O item não é desta retirada.',
    });
    await expect(autorizarEnvio(db, meta(b.id, { tipo: 'FOTO_3_PRODUTO', itemId: itemB.id }), 1000, operador)).resolves.toBeUndefined();
    await expect(autorizarEnvio(db, meta(randomUUID()), 1000, operador)).rejects.toMatchObject({ status: 404 });
  });
});

describe('separada das devoluções', () => {
  it('uma retirada conferida não aparece no quadro, nas etapas nem na Busca Avançada', async () => {
    const r = await criarRetirada(db, 'FULLSEP', operador);
    await enviarFoto(r.id);
    await biparProduto(db, r.id, '123', 'Capinha', operador);
    await concluirRetirada(db, r.id, operador);
    for (const coluna of await montarQuadro(db)) expect(coluna.total, coluna.titulo).toBe(0);
    expect((await buscarDevolucoes(db, {})).total).toBe(0);
    expect((await buscarDevolucoes(db, { rastreio: 'FULLSEP' })).total).toBe(0);
  });

  it('a lista traz as retiradas da mais nova para a mais velha, com o total de itens e quem recebeu', async () => {
    const a = await criarRetirada(db, 'FULLL1', operador);
    await biparProduto(db, a.id, '1', 'Um', operador);
    await biparProduto(db, a.id, '1', null, operador);
    await biparProduto(db, a.id, '2', 'Dois', operador);
    await criarRetirada(db, 'FULLL2', operador);
    const { retiradas, total } = await listarRetiradas(db, { pagina: 1 });
    expect(total).toBe(2);
    expect(retiradas.map((x) => [x.codigo, x.codigoEtiqueta, x.situacao, x.totalItens, x.recebidaPorNome])).toEqual([
      ['RF-000002', 'FULLL2', 'ABERTA', 0, operador.nome],
      ['RF-000001', 'FULLL1', 'ABERTA', 3, operador.nome],
    ]);
  });
});
