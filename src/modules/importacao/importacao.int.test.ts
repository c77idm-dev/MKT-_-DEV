import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { importacoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarFornecedores } from '@/modules/catalogo/fornecedores';
import { listarProdutos } from '@/modules/catalogo/produtos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarFornecedorTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { montarPlanilha } from './planilha';
import { obterDefinicao } from './definicoes';
import type { DefinicaoImportacao } from './definicao';
import {
  calcularPrevia,
  confirmarImportacao,
  definirMapeamento,
  ErroImportacao,
  mapeamentoEfetivo,
  mapeamentoSalvo,
  obterImportacao,
  registrarUpload,
} from './servico';

const { db, sql } = criarDbTeste();
let fiscal: UsuarioSessao;

function definicao(tipo: string): DefinicaoImportacao {
  const def = obterDefinicao(tipo);
  if (!def) throw new Error(`sem definição para ${tipo}`);
  return def;
}

async function enviar(tipo: 'produtos' | 'fornecedores', cabecalhos: string[], linhas: string[][], agora?: Date) {
  const id = await registrarUpload(db, { tipo, nomeArquivo: `${tipo}.csv`, planilha: { cabecalhos, linhas }, usuarioId: fiscal.id }, agora);
  const imp = await obterImportacao(db, id, tipo);
  if (!imp) throw new Error('importação não gravada');
  return imp;
}

beforeEach(async () => {
  await limparTabelas(sql);
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

describe('definições', () => {
  it('existe definição para produtos e fornecedores, com a permissão da spec §6.9', () => {
    expect(definicao('produtos')).toMatchObject({ acao: 'gerir_catalogo', voltarPara: '/cadastros/produtos' });
    expect(definicao('fornecedores')).toMatchObject({ acao: 'gerir_catalogo', voltarPara: '/cadastros/fornecedores' });
    expect(obterDefinicao('qualquer')).toBeNull();
  });
});

describe('importação de fornecedores', () => {
  it('sugere as colunas, mostra a prévia e acusa CNPJ repetido no arquivo (vale a última linha)', async () => {
    const def = definicao('fornecedores');
    const imp = await enviar('fornecedores', ['Razão Social', 'CNPJ', 'UF'], [
      ['Alfa Ltda', '11.222.333/0001-81', 'SP'],
      ['Alfa de novo', '11222333000181', 'SP'],
      ['Beta SA', '123', 'MG'],
    ]);
    const mapeamento = await mapeamentoEfetivo(db, def, imp);
    expect(mapeamento).toMatchObject({ razao_social: 'Razão Social', cnpj: 'CNPJ', uf: 'UF', email_sac: null });
    const previa = await calcularPrevia(db, def, imp, mapeamento);
    expect(previa.validas).toBe(1);
    expect(previa.comErro).toBe(2);
    expect(previa.linhas.map((l) => [l.numeroLinha, l.erros])).toEqual([
      [2, ['linha repetida: o CNPJ 11.222.333/0001-81 aparece de novo na linha 3']],
      [3, []],
      [4, ['CNPJ inválido: 123']],
    ]);
  });
});

describe('importação de produtos', () => {
  it('acusa fornecedor não cadastrado e SKU repetido', async () => {
    await criarFornecedorTeste(db, { cnpj: '11222333000181' });
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Código', 'Descrição', 'CNPJ Fornecedor'], [
      ['FONE-01', 'Fone', '11222333000181'],
      ['fone-01', 'Fone repetido', ''],
      ['CABO-02', 'Cabo', '12345678000195'],
    ]);
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa.linhas.map((l) => l.erros)).toEqual([
      ['linha repetida: o SKU FONE-01 aparece de novo na linha 3'],
      [],
      ['Fornecedor não cadastrado (CNPJ 12.345.678/0001-95). Importe os fornecedores antes.'],
    ]);
  });

  it('SKU repetido: o upsert grava só a última ocorrência e não quebra o lote', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['SKU', 'Descrição'], [['A1', 'Antiga'], ['B2', 'Cabo'], ['a1', 'Nova']]);
    const resumo = await confirmarImportacao(db, def, imp, { sku: 'SKU', descricao: 'Descrição' }, fiscal);
    expect(resumo).toEqual({ criados: 2, atualizados: 0, ignorados: 1, linhasComErro: [2] });
    expect((await listarProdutos(db)).linhas.map((p) => [p.sku, p.descricao]).sort()).toEqual([['A1', 'Nova'], ['B2', 'Cabo']]);
  });

  it('custo acima do limite é erro da linha, não estouro no banco', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['SKU', 'Descrição', 'Custo'], [['A1', 'Caro', '99999999999'], ['B2', 'Ok', '12,5']]);
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa.linhas.map((l) => l.erros)).toEqual([['Custo acima do máximo permitido (9.999.999.999,99)'], []]);
  });

  it('linhas em branco antes do cabeçalho: as mensagens citam a linha real da planilha', async () => {
    const def = definicao('produtos');
    const planilha = montarPlanilha([[], [], ['SKU', 'Descrição'], ['A1', 'Ok'], ['', 'Sem SKU']]);
    const id = await registrarUpload(db, { tipo: 'produtos', nomeArquivo: 'p.csv', planilha, usuarioId: fiscal.id });
    const imp = await obterImportacao(db, id, 'produtos');
    if (!imp) throw new Error('sumiu');
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa.linhas.map((l) => l.numeroLinha)).toEqual([4, 5]);
  });

  it('avisa quais campos obrigatórios estão sem coluna', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Coluna A', 'Coluna B'], [['x', 'y']]);
    const previa = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(previa).toEqual({ linhas: [], validas: 0, comErro: 0, faltando: ['SKU', 'Descrição'] });
  });

  it('confirma: grava só as linhas válidas, guarda o resumo e o mapeamento do tipo, e não confirma duas vezes', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Ref', 'Nome', 'GTIN'], [
      ['FONE-01', 'Fone', '7891000000014'],
      ['CABO-02', 'Cabo', '7891000000099'],
    ]);
    const mapeamento = await definirMapeamento(db, def, imp, { sku: 'Ref', descricao: 'Nome', ean: 'GTIN', ncm: 'Não existe' });
    expect(mapeamento).toMatchObject({ sku: 'Ref', descricao: 'Nome', ean: 'GTIN', ncm: null });

    const recarregada = await obterImportacao(db, imp.id, 'produtos');
    if (!recarregada) throw new Error('sumiu');
    expect(await mapeamentoEfetivo(db, def, recarregada)).toEqual(mapeamento);

    const resumo = await confirmarImportacao(db, def, recarregada, mapeamento, fiscal);
    expect(resumo).toEqual({ criados: 1, atualizados: 0, ignorados: 1, linhasComErro: [3] });
    expect((await listarProdutos(db)).linhas.map((p) => p.sku)).toEqual(['FONE-01']);

    const [gravada] = await db.select().from(importacoes).where(eq(importacoes.id, imp.id));
    expect(gravada).toMatchObject({ situacao: 'CONCLUIDA', linhas: [], resumo });
    expect(await mapeamentoSalvo(db, 'produtos')).toEqual(mapeamento);

    await expect(confirmarImportacao(db, def, recarregada, mapeamento, fiscal)).rejects.toThrow(
      new ErroImportacao('Esta importação já foi concluída.'),
    );
  });

  it('a próxima importação do mesmo tipo já vem com o mapeamento salvo', async () => {
    const def = definicao('produtos');
    // "Col X" e "Col Y" não lembram nenhum campo: só o mapeamento salvo explica a sugestão.
    const primeira = await enviar('produtos', ['Col X', 'Col Y'], [['FONE-01', 'Fone']]);
    await confirmarImportacao(db, def, primeira, { sku: 'Col X', descricao: 'Col Y' }, fiscal);
    const segunda = await enviar('produtos', ['Col Y', 'Col X'], [['Cabo', 'CABO-02']]);
    expect(await mapeamentoEfetivo(db, def, segunda)).toMatchObject({ sku: 'Col X', descricao: 'Col Y' });
  });

  it('recusa confirmar sem nenhuma linha válida (e não marca a importação como concluída)', async () => {
    const def = definicao('produtos');
    const imp = await enviar('produtos', ['Ref', 'Nome'], [['', 'Sem SKU']]);
    await expect(confirmarImportacao(db, def, imp, { sku: 'Ref', descricao: 'Nome' }, fiscal)).rejects.toThrow(
      'Nenhuma linha está pronta para importar. Corrija a planilha e envie de novo.',
    );
    expect((await obterImportacao(db, imp.id, 'produtos'))?.situacao).toBe('PENDENTE');
  });
});

describe('fornecedores confirmados atualizam pelo CNPJ', () => {
  it('upsert conta novos e atualizados', async () => {
    await criarFornecedorTeste(db, { cnpj: '11222333000181', razaoSocial: 'Alfa Antiga' });
    const def = definicao('fornecedores');
    const imp = await enviar('fornecedores', ['Razão Social', 'CNPJ'], [
      ['Alfa Nova', '11222333000181'],
      ['Beta', '12345678000195'],
    ]);
    const resumo = await confirmarImportacao(db, def, imp, { razao_social: 'Razão Social', cnpj: 'CNPJ' }, fiscal);
    expect(resumo).toMatchObject({ criados: 1, atualizados: 1, ignorados: 0 });
    expect((await listarFornecedores(db)).linhas.map((f) => f.razaoSocial)).toEqual(['Alfa Nova', 'Beta']);
  });
});

describe('limpeza', () => {
  it('apaga importações pendentes com mais de 1 dia no próximo envio', async () => {
    const antiga = await enviar('produtos', ['Ref'], [['A']], new Date('2026-11-10T12:00:00Z'));
    await enviar('produtos', ['Ref'], [['B']], new Date('2026-11-12T12:00:00Z'));
    expect(await obterImportacao(db, antiga.id, 'produtos')).toBeNull();
  });

  it('obterImportacao não acha id inválido nem de outro tipo', async () => {
    const imp = await enviar('produtos', ['Ref'], [['A']]);
    expect(await obterImportacao(db, 'nao-e-uuid', 'produtos')).toBeNull();
    expect(await obterImportacao(db, imp.id, 'fornecedores')).toBeNull();
  });
});
