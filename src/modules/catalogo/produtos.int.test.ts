import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarFornecedorTeste } from '../../../tests/helpers/fabricas';
import { ErroCadastro } from './erros';
import {
  idsDosProdutos,
  interpretarLinhaProduto,
  listarProdutos,
  obterProduto,
  salvarProduto,
  upsertProdutos,
  type DadosProduto,
} from './produtos';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

const FONE: DadosProduto = {
  sku: 'FONE-01',
  ean: '7891000000014',
  descricao: 'Fone Bluetooth',
  cnpjFornecedor: null,
  ncm: '85183000',
  custo: '89.90',
  unidade: 'UN',
};

describe('interpretarLinhaProduto', () => {
  it('normaliza SKU, EAN, CNPJ do fornecedor, NCM, custo e unidade', () => {
    const { dados, erros } = interpretarLinhaProduto({
      sku: ' fone-01 ',
      ean: '7891000000014',
      descricao: 'Fone Bluetooth',
      cnpj_fornecedor: '11.222.333/0001-81',
      ncm: '8518.30.00',
      custo: '89,90',
      unidade: 'un',
    });
    expect(erros).toEqual([]);
    expect(dados).toEqual({ sku: 'FONE-01', ean: '7891000000014', descricao: 'Fone Bluetooth', cnpjFornecedor: '11222333000181', ncm: '85183000', custo: '89.90', unidade: 'UN' });
  });

  it('junta os erros da linha', () => {
    const { dados, erros } = interpretarLinhaProduto({ sku: '', descricao: '', ean: '7891000000099', cnpj_fornecedor: '1', ncm: '12', custo: 'abc' });
    expect(dados).toBeNull();
    expect(erros).toEqual([
      'Informe o SKU',
      'Informe a descrição',
      'EAN inválido: 7891000000099',
      'CNPJ do fornecedor inválido: 1',
      'NCM inválido (precisa ter 8 dígitos): 12',
      'Custo inválido: abc',
    ]);
  });
});

describe('produtos no banco', () => {
  it('liga o produto ao fornecedor pelo CNPJ e recusa fornecedor não cadastrado', async () => {
    await criarFornecedorTeste(db, { cnpj: '11222333000181', razaoSocial: 'Alfa Ltda' });
    const id = await salvarProduto(db, { ...FONE, cnpjFornecedor: '11222333000181' });
    expect(await obterProduto(db, id)).toMatchObject({ sku: 'FONE-01', cnpjFornecedor: '11222333000181', custo: '89.90' });
    await expect(salvarProduto(db, { ...FONE, sku: 'X-1', cnpjFornecedor: '12345678000195' })).rejects.toThrow(
      new ErroCadastro('Fornecedor não cadastrado (CNPJ 12.345.678/0001-95)'),
    );
  });

  it('recusa SKU repetido', async () => {
    await salvarProduto(db, FONE);
    await expect(salvarProduto(db, { ...FONE, descricao: 'Outro' })).rejects.toThrow(new ErroCadastro('Já existe um produto com o SKU FONE-01'));
  });

  it('upsert pelo SKU conta novos e atualizados e mantém o que veio vazio', async () => {
    await salvarProduto(db, FONE);
    const resultado = await upsertProdutos(db, [
      { ...FONE, descricao: 'Fone Bluetooth Preto', ean: null, custo: null },
      { ...FONE, sku: 'CABO-02', ean: '7891000000021', descricao: 'Cabo USB-C', ncm: null, custo: '12.50' },
    ]);
    expect(resultado).toEqual({ criados: 1, atualizados: 1 });
    const { linhas } = await listarProdutos(db, { busca: 'fone' });
    expect(linhas).toEqual([expect.objectContaining({ sku: 'FONE-01', descricao: 'Fone Bluetooth Preto', ean: '7891000000014', custo: '89.90' })]);
  });

  it('busca por SKU, EAN ou descrição e acha os ids pelo SKU', async () => {
    const id = await salvarProduto(db, FONE);
    await salvarProduto(db, { ...FONE, sku: 'CABO-02', ean: '7891000000021', descricao: 'Cabo USB-C' });
    expect((await listarProdutos(db, { busca: '7891000000021' })).linhas.map((p) => p.sku)).toEqual(['CABO-02']);
    expect((await listarProdutos(db)).linhas.map((p) => p.sku)).toEqual(['CABO-02', 'FONE-01']);
    expect(await idsDosProdutos(db, ['FONE-01', 'NAO-EXISTE'])).toEqual(new Map([['FONE-01', id]]));
    expect(await idsDosProdutos(db, [])).toEqual(new Map());
  });
});
