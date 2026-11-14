import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import { devolucoes, itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste } from '../../../tests/helpers/fabricas-fiscal';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../../../tests/helpers/fabricas-lotes';
import { autorizarDevolucaoTeste } from '../../../tests/helpers/fluxo-lotes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  definirEmissorParaTestes(new EmissorFalso());
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

describe('porta de lotes no ciclo da Fase 4 (contrato §5.7)', () => {
  it('NF de devolução autorizada: BOM disponível, PROBLEMA no lote do fornecedor, devolução concluída', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ destino: 'BOM', produtoId: p.id }, { destino: 'PROBLEMA', motivo: 'AVARIADO', produtoId: p.id }],
    });
    await autorizarDevolucaoTeste(db, fila, { devolucaoId: dev.id, codigosVenda: [p.sku, p.sku], fiscal, agora: AGORA });

    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('CONCLUIDA');
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
    const [lote] = await db.select().from(lotes);
    expect(itens.map((i) => [i.status, i.loteId])).toEqual([
      ['DISPONIVEL_VENDA', null],
      ['EM_LOTE', lote.id],
    ]);
  });
});
