import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { alocarItensProblema } from './alocacao';
import { listarLotes, listarSemFornecedor, obterDetalheLote, resumoLotesQuadro, unidadesDaDevolucaoNosLotes } from './consultas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function loteCom(status: 'ABERTO' | 'FECHADO' | 'FINALIZADO', unidades = 1, fornecedorId?: string) {
  const f = fornecedorId ?? (await criarFornecedorCompletoTeste(db)).id;
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: Array.from({ length: unidades }, () => ({ destino: 'PROBLEMA' as const, serial: 'SN-9' })) });
  return { ...(await criarLoteTeste(db, { fornecedorId: f, status, itemIds: dev.itens.map((i) => i.id) })), fornecedorId: f, dev };
}

describe('consultas dos lotes', () => {
  it('lista com filtros, na ordem do fluxo, com o selo da NF rejeitada', async () => {
    const fechado = await loteCom('FECHADO', 2);
    const aberto = await loteCom('ABERTO');
    await loteCom('FINALIZADO');
    await db.insert(notasFiscais).values({ tipo: 'REMESSA_CONSERTO', loteId: fechado.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: randomUUID().replace(/-/g, ''), situacao: 'REJEITADA' });

    const todos = await listarLotes(db, {});
    expect(todos.total).toBe(3);
    expect(todos.lotes.map((l) => l.status)).toEqual(['ABERTO', 'FECHADO', 'FINALIZADO']);
    expect(todos.lotes[1]).toMatchObject({ codigo: fechado.codigo, unidades: 2, rotuloStatus: 'Fechado', tipo: 'Conserto', seloNota: { texto: 'NF rejeitada', tom: 'erro' } });
    expect((await listarLotes(db, { status: 'ABERTO' })).lotes.map((l) => l.id)).toEqual([aberto.id]);
    expect((await listarLotes(db, { fornecedorId: fechado.fornecedorId })).lotes.map((l) => l.id)).toEqual([fechado.id]);
    expect((await listarLotes(db, { busca: fechado.dev.codigo })).lotes.map((l) => l.id)).toEqual([fechado.id]);
    expect((await listarLotes(db, { busca: 'SN-9' })).total).toBe(3);
    expect((await resumoLotesQuadro(db)).total).toBe(2);
  });

  it('lote vazio que não está aberto some das listas e do quadro (decisão 3); o aberto vazio aparece', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO' });
    const abertoVazio = await criarLoteTeste(db, { fornecedorId: f.id });
    expect((await listarLotes(db, {})).lotes.map((l) => l.id)).toEqual([abertoVazio.id]);
    expect((await resumoLotesQuadro(db)).total).toBe(1);
  });

  it('o histórico do lote junta os eventos das NF de remessa dele (decisão 18)', async () => {
    const l = await loteCom('FECHADO');
    const [nota] = await db
      .insert(notasFiscais)
      .values({ tipo: 'REMESSA_CONSERTO', loteId: l.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: randomUUID().replace(/-/g, ''), situacao: 'REJEITADA' })
      .returning();
    await registrarEvento(db, { entidade: 'nota_fiscal', entidadeId: nota.id, acao: 'nf_rejeitada', de: 'PROCESSANDO', para: 'REJEITADA', usuarioId: null });
    const d = await obterDetalheLote(db, l.codigo, AGORA);
    expect(d?.historico.map((h) => h.texto)).toContain('NF-e rejeitada');
  });

  it('detalhe: unidades, editável, destinos para mover e o outro lote aberto do fornecedor', async () => {
    const aberto = await loteCom('ABERTO', 2);
    const fechado = await loteCom('FECHADO', 1, aberto.fornecedorId);
    const d = await obterDetalheLote(db, fechado.codigo, AGORA);
    expect(d).toMatchObject({ codigo: fechado.codigo, status: 'FECHADO', editavel: true, outroAberto: aberto.codigo, temLista: false, nota: null });
    expect(d?.unidades[0]).toMatchObject({ devolucaoCodigo: fechado.dev.codigo, unidade: 1, serial: 'SN-9', motivo: 'Avariado', rotuloStatus: 'Em lote' });
    expect(d?.destinos).toEqual([{ valor: aberto.id, rotulo: `${aberto.codigo} (Aberto)` }]);
    expect(await obterDetalheLote(db, 'LOT-999999', AGORA)).toBeNull();
  });

  it('pendência SEM_FORNECEDOR e a visão da devolução', async () => {
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', motivo: 'USADO', produtoId: orfao.id }] });
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
    expect(await listarSemFornecedor(db)).toEqual({
      total: 1,
      unidades: [expect.objectContaining({ devolucaoCodigo: dev.codigo, unidade: 1, sku: orfao.sku, motivo: 'Usado', skuSugerido: orfao.sku })],
    });
    expect((await listarSemFornecedor(db, { limite: 0 })).unidades).toEqual([]);
    expect(await unidadesDaDevolucaoNosLotes(db, dev.id)).toEqual([{ unidade: 1, sku: orfao.sku, rotuloStatus: 'Sem fornecedor', lote: null, resultado: null }]);
  });
});
