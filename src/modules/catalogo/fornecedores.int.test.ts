import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { ErroCadastro } from './erros';
import {
  interpretarLinhaFornecedor,
  listarFornecedores,
  obterFornecedor,
  salvarFornecedor,
  upsertFornecedores,
  type DadosFornecedor,
} from './fornecedores';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

const ALFA: DadosFornecedor = {
  razaoSocial: 'Alfa Eletrônicos Ltda',
  cnpj: '11222333000181',
  ie: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: 'São Paulo',
  uf: 'SP',
  cep: null,
  contatoSac: null,
  emailSac: 'sac@alfa.com.br',
};

describe('interpretarLinhaFornecedor', () => {
  it('normaliza CNPJ, UF, CEP, IE e e-mail', () => {
    const { dados, erros } = interpretarLinhaFornecedor({
      razao_social: ' Alfa Ltda ',
      cnpj: '11.222.333/0001-81',
      ie: 'isento',
      uf: 'sp',
      cep: '1310100',
      email_sac: ' SAC@Alfa.com.br ',
    });
    expect(erros).toEqual([]);
    expect(dados).toMatchObject({ razaoSocial: 'Alfa Ltda', cnpj: '11222333000181', ie: 'ISENTO', uf: 'SP', cep: '01310100', emailSac: 'sac@alfa.com.br' });
  });

  it('junta todos os erros da linha', () => {
    const { dados, erros } = interpretarLinhaFornecedor({ razao_social: '', cnpj: '123', uf: 'XX', cep: '1', email_sac: 'sem-arroba' });
    expect(dados).toBeNull();
    expect(erros).toEqual(['Informe a razão social', 'CNPJ inválido: 123', 'UF inválida: XX', 'CEP inválido: 1', 'E-mail do SAC inválido: sem-arroba']);
  });
});

describe('fornecedores no banco', () => {
  it('cria, edita e recusa CNPJ repetido', async () => {
    const id = await salvarFornecedor(db, ALFA);
    await salvarFornecedor(db, { ...ALFA, razaoSocial: 'Alfa Eletrônicos SA' }, id);
    expect(await obterFornecedor(db, id)).toMatchObject({ razaoSocial: 'Alfa Eletrônicos SA', cnpj: '11222333000181' });
    await expect(salvarFornecedor(db, { ...ALFA, razaoSocial: 'Outro' })).rejects.toThrow(
      new ErroCadastro('Já existe um fornecedor com o CNPJ 11.222.333/0001-81'),
    );
  });

  it('obterFornecedor devolve null para id que não é UUID', async () => {
    expect(await obterFornecedor(db, 'abc')).toBeNull();
  });

  it('upsert pelo CNPJ conta novos e atualizados e não apaga o que veio vazio', async () => {
    await salvarFornecedor(db, ALFA);
    const resultado = await upsertFornecedores(db, [
      { ...ALFA, razaoSocial: 'Alfa Nova Razão', emailSac: null, cidade: 'Campinas' },
      { ...ALFA, cnpj: '12345678000195', razaoSocial: 'Beta Ltda', cidade: null, uf: null, emailSac: null },
    ]);
    expect(resultado).toEqual({ criados: 1, atualizados: 1 });
    const { linhas } = await listarFornecedores(db, { busca: 'alfa' });
    expect(linhas).toEqual([
      expect.objectContaining({ razaoSocial: 'Alfa Nova Razão', cidade: 'Campinas', emailSac: 'sac@alfa.com.br' }),
    ]);
  });

  it('lista em ordem alfabética e busca por nome ou CNPJ', async () => {
    await salvarFornecedor(db, { ...ALFA, cnpj: '12345678000195', razaoSocial: 'Beta Ltda' });
    await salvarFornecedor(db, ALFA);
    expect((await listarFornecedores(db)).linhas.map((f) => f.razaoSocial)).toEqual(['Alfa Eletrônicos Ltda', 'Beta Ltda']);
    expect((await listarFornecedores(db, { busca: '12.345.678' })).linhas.map((f) => f.razaoSocial)).toEqual(['Beta Ltda']);
    expect((await listarFornecedores(db, { busca: 'zzz' })).total).toBe(0);
  });
});
