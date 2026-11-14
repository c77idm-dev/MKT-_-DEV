import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('schema dos lotes (contrato §4.4)', () => {
  it('gera o código LOT-000001 e nasce ABERTO', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const [lote] = await db.insert(lotes).values({ fornecedorId: f.id }).returning();
    expect(lote).toMatchObject({ codigo: 'LOT-000001', status: 'ABERTO', tipo: null, notaFiscalId: null });
  });

  it('no máximo um lote ABERTO por fornecedor (spec §5.4)', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    await db.insert(lotes).values({ fornecedorId: f.id });
    await expect(db.insert(lotes).values({ fornecedorId: f.id })).rejects.toThrow();
    await expect(db.insert(lotes).values({ fornecedorId: f.id, status: 'FECHADO', tipo: 'TROCA' })).resolves.toBeDefined();
  });

  it('lote_id só com status EM_LOTE, ENVIADO ou RESOLVIDO; resultado só com RESOLVIDO (decisão 20)', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA' }] });
    const lote = await criarLoteTeste(db, { fornecedorId: f.id });
    const item = dev.itens[0].id;
    await expect(db.update(itensDevolucao).set({ loteId: lote.id }).where(eq(itensDevolucao.id, item))).rejects.toThrow();
    await db.update(itensDevolucao).set({ loteId: lote.id, status: 'EM_LOTE' }).where(eq(itensDevolucao.id, item));
    await expect(db.update(itensDevolucao).set({ resultadoFornecedor: 'CREDITO' }).where(eq(itensDevolucao.id, item))).rejects.toThrow();
    await db.update(itensDevolucao).set({ status: 'RESOLVIDO', resultadoFornecedor: 'CREDITO' }).where(eq(itensDevolucao.id, item));
    const [linha] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, item));
    expect(linha).toMatchObject({ status: 'RESOLVIDO', loteId: lote.id, resultadoFornecedor: 'CREDITO' });
  });

  it('a fábrica põe as unidades no lote com o status pedido', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA' }, { destino: 'PROBLEMA' }] });
    const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'ENVIADO', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id), rastreio: 'BR1' });
    const itens = await db.select({ status: itensDevolucao.status }).from(itensDevolucao).where(eq(itensDevolucao.loteId, lote.id));
    expect(itens.map((i) => i.status)).toEqual(['ENVIADO', 'ENVIADO']);
  });
});
