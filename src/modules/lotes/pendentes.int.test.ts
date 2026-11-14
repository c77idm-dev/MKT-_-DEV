import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao, lotes, produtos } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../../../tests/helpers/fabricas-lotes';
import { alocarItensProblema } from './alocacao';
import { alocarPendentes, associarProduto } from './pendentes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

/** Devolução concluída com uma unidade PROBLEMA já em SEM_FORNECEDOR. */
async function semFornecedor(produtoId: string | null) {
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId }] });
  await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: AGORA }).where(eq(devolucoes.id, dev.id));
  await db.transaction((tx) => alocarItensProblema(tx, dev.id, AGORA));
  return dev.itens[0].id;
}
async function item(id: string) {
  const [i] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, id));
  return i;
}

describe('associarProduto (spec §5.3: SEM_FORNECEDOR → EM_LOTE)', () => {
  it('liga o produto recebido e põe a unidade no lote ABERTO do fornecedor', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const itemId = await semFornecedor(null);
    const { loteCodigo } = await associarProduto(db, itemId, ` ${p.sku.toLowerCase()} `, fiscal, AGORA);
    const [lote] = await db.select().from(lotes);
    expect(loteCodigo).toBe(lote.codigo);
    expect(await item(itemId)).toMatchObject({ status: 'EM_LOTE', loteId: lote.id, produtoRecebidoId: p.id });
  });

  it('explica o que falta: SKU fora do cadastro, produto sem fornecedor', async () => {
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const itemId = await semFornecedor(orfao.id);
    await expect(associarProduto(db, itemId, 'NAO-EXISTE', fiscal, AGORA)).rejects.toThrow(
      'O SKU NAO-EXISTE não está no cadastro: cadastre o produto em Produtos e Fornecedores.',
    );
    await expect(associarProduto(db, itemId, orfao.sku, fiscal, AGORA)).rejects.toThrow(
      `O produto ${orfao.sku} não tem fornecedor: escolha o fornecedor dele em Produtos e Fornecedores.`,
    );
    expect((await item(itemId)).status).toBe('SEM_FORNECEDOR');
  });

  it('recusa unidade que não está pendente e quem não é Fiscal nem Gestor', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const itemId = await semFornecedor(null);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(associarProduto(db, itemId, p.sku, operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
    await associarProduto(db, itemId, p.sku, fiscal, AGORA);
    await expect(associarProduto(db, itemId, p.sku, fiscal, AGORA)).rejects.toThrow('Esta unidade não está mais sem fornecedor.');
  });
});

describe('alocarPendentes (tarefa lotes.alocar-pendentes)', () => {
  it('aloca o que a porta "sem lotes" deixou (D11) e o SEM_FORNECEDOR cujo produto ganhou fornecedor; a 2ª rodada não muda nada', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    // (a) D11: devolução concluída, unidade PROBLEMA ainda em AGUARDANDO_NF.
    const antiga = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: AGORA }).where(eq(devolucoes.id, antiga.id));
    // (b) SEM_FORNECEDOR e depois o produto ganhou fornecedor no cadastro.
    const orfao = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const pendente = await semFornecedor(orfao.id);
    await db.update(produtos).set({ fornecedorId: f.id }).where(eq(produtos.id, orfao.id));
    // Fora: devolução ainda em AGUARDANDO_NF (a NF não saiu).
    const semNf = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });

    expect(await alocarPendentes(db, AGORA)).toEqual({ alocadas: 2, semFornecedor: 0, falhas: 0 });
    expect((await item(antiga.itens[0].id)).status).toBe('EM_LOTE');
    expect((await item(pendente)).status).toBe('EM_LOTE');
    expect((await item(semNf.itens[0].id)).status).toBe('AGUARDANDO_NF');
    expect(await alocarPendentes(db, AGORA)).toEqual({ alocadas: 0, semFornecedor: 0, falhas: 0 });
  });

  it('erro numa devolução vai para o log e não impede as outras', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const boa = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    const ruim = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: p.id }] });
    await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: AGORA });
    const logs: Record<string, unknown>[] = [];
    // A 1ª devolução da varredura falha (simulado); a tarefa registra e segue.
    const r = await alocarPendentes(db, AGORA, {
      registrar: (linha) => logs.push(linha),
      antesDeCada: (devolucaoId) => {
        if (devolucaoId === ruim.id) throw new Error('falha simulada');
      },
    });
    expect(r).toEqual({ alocadas: 1, semFornecedor: 0, falhas: 1 });
    expect((await item(boa.itens[0].id)).status).toBe('EM_LOTE');
    expect(logs).toEqual([expect.objectContaining({ nivel: 'erro', tarefa: 'lotes.alocar-pendentes', devolucaoId: ruim.id, mensagem: 'falha simulada' })]);
  });
});

describe('associarProduto: ordem das travas', () => {
  it('dois pedidos ao mesmo tempo para a mesma unidade: um entra no lote, o outro recebe a mensagem', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const itemId = await semFornecedor(null);
    const r = await Promise.allSettled([associarProduto(db, itemId, p.sku, fiscal, AGORA), associarProduto(db, itemId, p.sku, gestor, AGORA)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: 'Esta unidade não está mais sem fornecedor.' }) });
  });
});
