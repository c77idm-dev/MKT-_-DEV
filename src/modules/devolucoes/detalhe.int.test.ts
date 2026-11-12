import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarFornecedorTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { obterDetalhe } from './detalhe';
import { receberPorRastreio } from './recebimento';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('obterDetalhe', () => {
  it('traz os dados, os itens com produto e fornecedor e o histórico com o nome de quem fez', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await criarFornecedorTeste(db, { cnpj: '11222333000181', razaoSocial: 'Alfa Ltda' });
    await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone Bluetooth', ean: '7891000000014', cnpjFornecedor: '11222333000181' });
    const d = await criarDevolucaoTeste(db, operador, {
      pedido: 'SHP-55',
      rastreio: 'BR555',
      itens: [
        { sku: 'FONE-01', quantidade: 1 },
        { sku: 'SEM-CADASTRO', quantidade: 1 },
      ],
    });
    await db.update(itensDevolucao).set({ serial: 'SN-1' }).where(eq(itensDevolucao.unidade, 1));
    await receberPorRastreio(db, 'BR555', operador);

    const detalhe = await obterDetalhe(db, d.codigo.toLowerCase());
    expect(detalhe).toMatchObject({
      codigo: d.codigo,
      canal: 'SHOPEE',
      status: 'AGUARDANDO_CONFERENCIA',
      pedidos: ['SHP-55'],
      rastreio: 'BR555',
      criadoPorNome: operador.nome,
      recebidaPorNome: operador.nome,
    });
    expect(detalhe?.itens).toEqual([
      expect.objectContaining({ unidade: 1, sku: 'FONE-01', descricao: 'Fone Bluetooth', ean: '7891000000014', fornecedor: 'Alfa Ltda', serial: 'SN-1', status: 'PENDENTE' }),
      expect.objectContaining({ unidade: 2, sku: 'SEM-CADASTRO', descricao: null, ean: null, fornecedor: null }),
    ]);
    expect(detalhe?.eventos.map((e) => e.acao)).toEqual(['criada', 'recebida']);
  });

  it('devolve null para código desconhecido', async () => {
    expect(await obterDetalhe(db, 'DEV-999999')).toBeNull();
  });
});
