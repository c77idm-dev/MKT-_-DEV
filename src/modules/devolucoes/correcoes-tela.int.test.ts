import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, notasFiscais } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste, criarProdutoDoFornecedorTeste } from '../../../tests/helpers/fabricas-lotes';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { obterDadosCorrecao } from './correcoes-tela';

const { db, sql } = criarDbTeste();

beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

describe('obterDadosCorrecao (o que a seção Corrigir (Gestor) precisa)', () => {
  it('traz a devolução, a NF ativa e cada unidade com o produto recebido e o lote', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj, sku: 'SKU-CORR-1' });
    const dev = await criarDevolucaoComProblemasTeste(db, operador, {
      unidades: [
        { destino: 'BOM', produtoId: produto.id },
        { destino: 'PROBLEMA', motivo: 'USADO', produtoId: produto.id },
        { destino: 'AUSENTE' },
      ],
    });
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'FECHADO', itemIds: [dev.itens[1].id] });
    await db.update(devolucoes).set({ observacoes: 'caixa amassada' }).where(eq(devolucoes.id, dev.id));
    await db.insert(notasFiscais).values({
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      situacao: 'CANCELADA',
      referenciaEmissor: randomUUID().replaceAll('-', ''),
    });

    const d = await obterDadosCorrecao(db, dev.id);
    expect(d).toMatchObject({ status: 'AGUARDANDO_NF', origem: 'MANUAL', devolucaoExternaId: null, observacoes: 'caixa amassada', notaAtiva: null });
    expect(d?.unidades.map((u) => [u.unidade, u.status, u.destino, u.motivo, u.produtoRecebidoSku, u.loteCodigo, u.loteStatus])).toEqual([
      [1, 'AGUARDANDO_NF', 'BOM', null, 'SKU-CORR-1', null, null],
      [2, 'EM_LOTE', 'PROBLEMA', 'USADO', 'SKU-CORR-1', lote.codigo, 'FECHADO'],
      [3, 'AUSENTE', null, 'AUSENTE', null, null, null],
    ]);

    await db.insert(notasFiscais).values({
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      situacao: 'AUTORIZADA',
      autorizadaEm: new Date(),
      referenciaEmissor: randomUUID().replaceAll('-', ''),
    });
    expect((await obterDadosCorrecao(db, dev.id))?.notaAtiva).toBe('AUTORIZADA');
  });

  it('a apagada e o id inválido não são achados', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const dev = await criarDevolucaoTeste(db, operador);
    await db.update(devolucoes).set({ apagadaEm: new Date() }).where(eq(devolucoes.id, dev.id));
    expect(await obterDadosCorrecao(db, dev.id)).toBeNull();
    expect(await obterDadosCorrecao(db, 'nao-e-uuid')).toBeNull();
  });
});
