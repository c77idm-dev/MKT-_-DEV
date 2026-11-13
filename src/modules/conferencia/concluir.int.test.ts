import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, devolucoes, eventosHistorico, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciasCompletas, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { concluirConferencia } from './concluir';
import { ErroConclusao, ErroConferencia } from './erros';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let fila: FilaMemoria;
let produtoId: string;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  produtoId = await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone' });
});
afterAll(async () => {
  await sql.end();
});

async function decidir(itemId: string, destino: 'BOM' | 'PROBLEMA' | null, motivo: 'AVARIADO' | 'AUSENTE' | null) {
  await db.update(itensDevolucao).set({ destino, motivo }).where(eq(itensDevolucao.id, itemId));
}
async function situacao(id: string) {
  const [d] = await db
    .select({ status: devolucoes.status, conferidaEm: devolucoes.conferidaEm, concluidaEm: devolucoes.concluidaEm, conferenteId: devolucoes.conferenteId })
    .from(devolucoes)
    .where(eq(devolucoes.id, id));
  const itens = await db
    .select({ status: itensDevolucao.status, produtoRecebidoId: itensDevolucao.produtoRecebidoId })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, id))
    .orderBy(asc(itensDevolucao.unidade));
  return { ...d, itens };
}

describe('concluirConferencia', () => {
  it('recusa enquanto falta evidência ou destino, e não muda nada', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM' });
    const erro = await concluirConferencia(db, d.id, operador).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroConclusao);
    expect((erro as ErroConclusao).pendencias).toEqual([
      'Foto 1 (etiqueta de rastreio e declaração de conteúdo)',
      'Foto 3 da unidade 1',
      'Foto 4 da unidade 1',
      'Destino da unidade 1',
      'Vídeo de Prova',
    ]);
    expect((await situacao(d.id)).status).toBe('EM_CONFERENCIA');
  });

  it('conclui: unidades vão para Aguardando NF ou Ausente e a devolução para Aguardando NF', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 2 }] });
    await criarEvidenciasCompletas(db, d.id, [d.itens[0]]);
    await decidir(d.itens[0], 'BOM', null);
    await decidir(d.itens[1], null, 'AUSENTE');
    const agora = new Date('2026-11-12T15:00:00Z');

    expect(await concluirConferencia(db, d.id, operador, agora)).toEqual({ status: 'AGUARDANDO_NF' });
    expect(await situacao(d.id)).toEqual({
      status: 'AGUARDANDO_NF',
      conferidaEm: agora,
      concluidaEm: null,
      conferenteId: operador.id, // a trava fica gravada (contrato §4.1)
      // Unidade 1 sem leitura de EAN: o produto recebido é o esperado (decisão 9). A ausente não recebeu nada.
      itens: [
        { status: 'AGUARDANDO_NF', produtoRecebidoId: produtoId },
        { status: 'AUSENTE', produtoRecebidoId: null },
      ],
    });
    const eventos = await db
      .select({ entidade: eventosHistorico.entidade, acao: eventosHistorico.acao, para: eventosHistorico.para })
      .from(eventosHistorico)
      .where(eq(eventosHistorico.acao, 'item_conferido'))
      .orderBy(asc(eventosHistorico.id));
    expect(eventos).toEqual([
      { entidade: 'item', acao: 'item_conferido', para: 'AGUARDANDO_NF' },
      { entidade: 'item', acao: 'item_conferido', para: 'AUSENTE' },
    ]);
    const [concluida] = await db
      .select({ de: eventosHistorico.de, para: eventosHistorico.para })
      .from(eventosHistorico)
      .where(and(eq(eventosHistorico.entidadeId, d.id), eq(eventosHistorico.acao, 'conferencia_concluida')));
    expect(concluida).toEqual({ de: 'EM_CONFERENCIA', para: 'AGUARDANDO_NF' });
  });

  it('todas ausentes: a devolução já fica Concluída, em dois passos, pelo sistema', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, d.id, []);
    await decidir(d.itens[0], null, 'AUSENTE');
    const agora = new Date('2026-11-12T16:00:00Z');
    expect(await concluirConferencia(db, d.id, operador, agora)).toEqual({ status: 'CONCLUIDA' });
    expect(await situacao(d.id)).toMatchObject({ status: 'CONCLUIDA', conferidaEm: agora, concluidaEm: agora });
    const [evento] = await db
      .select({ de: eventosHistorico.de, para: eventosHistorico.para, usuarioId: eventosHistorico.usuarioId })
      .from(eventosHistorico)
      .where(and(eq(eventosHistorico.entidadeId, d.id), eq(eventosHistorico.acao, 'concluida')));
    expect(evento).toEqual({ de: 'AGUARDANDO_NF', para: 'CONCLUIDA', usuarioId: null });
  });

  it('vídeo SO_PROBLEMA: tudo Estoque Bom conclui sem vídeo', async () => {
    await db.insert(configuracoes).values({ id: 1, videoObrigatorio: 'SO_PROBLEMA' });
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    for (const tipo of ['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const) await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo });
    for (const tipo of ['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL'] as const) await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo, itemId: d.itens[0] });
    await decidir(d.itens[0], 'BOM', null);
    expect(await concluirConferencia(db, d.id, operador)).toEqual({ status: 'AGUARDANDO_NF' });
  });

  it('evidência que falhou no processamento não conta', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, d.id, []);
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: d.itens[0], situacao: 'FALHOU' });
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: d.itens[0] });
    await decidir(d.itens[0], 'BOM', null);
    await expect(concluirConferencia(db, d.id, operador)).rejects.toThrow('Ainda falta: Foto 3 da unidade 1.');
  });

  it('Mercado Livre: envia ml.enviar-resultado na transação, com a devolução como chave única; outros canais não', async () => {
    const ml = await criarDevolucaoEmConferencia(db, operador, { canal: 'MERCADO_LIVRE', itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, ml.id, ml.itens);
    await decidir(ml.itens[0], 'PROBLEMA', 'AVARIADO');
    await concluirConferencia(db, ml.id, operador);
    expect(fila.enviadas).toEqual([
      { nome: 'ml.enviar-resultado', dados: { devolucaoId: ml.id }, opcoes: { tx: expect.anything(), chaveUnica: ml.id } },
    ]);

    const shopee = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await criarEvidenciasCompletas(db, shopee.id, shopee.itens);
    await decidir(shopee.itens[0], 'BOM', null);
    await concluirConferencia(db, shopee.id, operador);
    expect(fila.enviadas).toHaveLength(1);
  });

  it('só quem está com a trava conclui', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(concluirConferencia(db, d.id, outro)).rejects.toThrow(ErroConferencia);
  });
});
