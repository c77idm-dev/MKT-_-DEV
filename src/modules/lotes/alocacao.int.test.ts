import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { alocarItensProblema, obterOuCriarLoteAberto } from './alocacao';

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

async function itensDe(devolucaoId: string) {
  return db
    .select({ unidade: itensDevolucao.unidade, status: itensDevolucao.status, loteId: itensDevolucao.loteId })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.devolucaoId, devolucaoId))
    .orderBy(asc(itensDevolucao.unidade));
}

describe('alocarItensProblema (spec §5.3)', () => {
  it('põe as unidades PROBLEMA no lote ABERTO do fornecedor do produto recebido, criando o lote', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [
        { destino: 'BOM', produtoId: p.id },
        { destino: 'PROBLEMA', motivo: 'AVARIADO', produtoId: p.id },
        { destino: 'PROBLEMA', motivo: 'COM_DEFEITO', produtoId: p.id },
        { destino: 'AUSENTE' },
      ],
    });
    expect(await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA))).toEqual({ alocadas: 2, semFornecedor: 0 });

    const [lote] = await db.select().from(lotes);
    expect(lote).toMatchObject({ codigo: 'LOT-000001', fornecedorId: f.id, status: 'ABERTO' });
    expect(await itensDe(dev.id)).toEqual([
      { unidade: 1, status: 'AGUARDANDO_NF', loteId: null },
      { unidade: 2, status: 'EM_LOTE', loteId: lote.id },
      { unidade: 3, status: 'EM_LOTE', loteId: lote.id },
      { unidade: 4, status: 'AUSENTE', loteId: null },
    ]);
    const eventos = await listarEventos(db, 'lote', lote.id);
    expect(eventos.map((e) => e.acao)).toEqual(['lote_criado', 'lote_item_incluido', 'lote_item_incluido']);
    expect(eventos[0]).toMatchObject({ de: null, para: 'ABERTO', usuarioNome: null });
    const doItem = await listarEventos(db, 'item', dev.itens[1].id);
    expect(doItem.at(-1)).toMatchObject({ acao: 'item_status', de: 'AGUARDANDO_NF', para: 'EM_LOTE' });
  });

  it('usa o lote ABERTO que já existe e ignora os fechados do mesmo fornecedor', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const fechado = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO', tipo: 'TROCA' });
    const aberto = await criarLoteTeste(db, { fornecedorId: f.id });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
    expect((await itensDe(dev.id))[0].loteId).toBe(aberto.id);
    expect((await itensDe(dev.id))[0].loteId).not.toBe(fechado.id);
  });

  it('separa por fornecedor e manda para SEM_FORNECEDOR o que não tem fornecedor', async () => {
    const f1 = await criarFornecedorCompletoTeste(db);
    const f2 = await criarFornecedorCompletoTeste(db);
    const p1 = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f1.cnpj });
    const p2 = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f2.cnpj });
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [
        { destino: 'PROBLEMA', produtoId: p1.id },
        { destino: 'PROBLEMA', produtoId: p2.id },
        { destino: 'PROBLEMA', produtoId: orfao.id },
        { destino: 'PROBLEMA', produtoId: null },
      ],
    });
    expect(await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA))).toEqual({ alocadas: 2, semFornecedor: 2 });
    const itens = await itensDe(dev.id);
    expect(itens.map((i) => i.status)).toEqual(['EM_LOTE', 'EM_LOTE', 'SEM_FORNECEDOR', 'SEM_FORNECEDOR']);
    expect(itens[0].loteId).not.toBe(itens[1].loteId);
    expect(await db.select().from(lotes)).toHaveLength(2);
  });

  it('é idempotente: rodar de novo não mexe em nada', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
    expect(await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA))).toEqual({ alocadas: 0, semFornecedor: 0 });
  });

  it('duas autorizações ao mesmo tempo para um fornecedor novo usam o mesmo lote (ON CONFLICT)', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const [a, b] = await Promise.all([
      db.transaction((tx) => obterOuCriarLoteAberto(tx, f.id, AGORA)),
      db.transaction((tx) => obterOuCriarLoteAberto(tx, f.id, AGORA)),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.criado, b.criado].filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(lotes)).toHaveLength(1);
  });
});
