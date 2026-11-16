import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { criarRetiradaTeste } from '../../../tests/helpers/fabricas-retiradas';
import { listarVoltaAoArmazem, resumirVoltaAoArmazem } from './consulta';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

// 14h de 16/11/2026 em Brasília.
const DIA_16 = new Date('2026-11-16T17:00:00Z');
const HOJE = { de: '2026-11-16', ate: '2026-11-16' };

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('listarVoltaAoArmazem (melhoria 4)', () => {
  it('junta as unidades BOM e os itens das retiradas conferidas; exclui AUSENTE, PROBLEMA e retirada aberta', async () => {
    await criarProdutoTeste(db, { sku: 'SKU-FONE', ean: '7890001', descricao: 'Fone de teste' });
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      unidades: [
        { sku: 'SKU-FONE', destino: 'BOM', serial: 'SN-1' },
        { sku: 'SKU-FONE', destino: 'PROBLEMA' },
        { sku: 'SKU-FONE', destino: 'AUSENTE' },
      ],
      agora: DIA_16,
    });
    const cabo = await criarProdutoTeste(db, { sku: 'SKU-CABO', ean: '7890002', descricao: 'Cabo de teste' });
    const conferida = await criarRetiradaTeste(db, gestor, {
      concluidaEm: new Date('2026-11-16T18:00:00Z'),
      itens: [
        { produtoId: cabo, eanLido: '7890002', quantidade: 3 },
        { eanLido: '555', descricao: 'Cabo genérico', quantidade: 1 },
      ],
    });
    await criarRetiradaTeste(db, gestor, { itens: [{ produtoId: cabo, quantidade: 9 }] });

    const linhas = await listarVoltaAoArmazem(db, HOJE);
    expect(linhas).toMatchObject([
      {
        tipo: 'DEVOLUCAO',
        data: DIA_16,
        origem: dev.codigo,
        sku: 'SKU-FONE',
        descricao: 'Fone de teste',
        ean: '7890001',
        quantidade: 1,
        situacao: 'Aguardando NF',
        serial: 'SN-1',
      },
      {
        tipo: 'RETIRADA',
        data: new Date('2026-11-16T18:00:00Z'),
        origem: conferida.codigo,
        sku: 'SKU-CABO',
        descricao: 'Cabo de teste',
        ean: '7890002',
        quantidade: 3,
        situacao: 'Retirada do Full',
        serial: null,
      },
      {
        tipo: 'RETIRADA',
        data: new Date('2026-11-16T18:00:00Z'),
        origem: conferida.codigo,
        sku: '',
        descricao: 'Cabo genérico',
        ean: '555',
        quantidade: 1,
        situacao: 'Retirada do Full',
        serial: null,
      },
    ]);
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(3);
  });

  it('unidade Disponível para venda continua entrando', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }], agora: DIA_16 });
    await db.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.devolucaoId, dev.id));
    const linhas = await listarVoltaAoArmazem(db, HOJE);
    expect(linhas).toMatchObject([{ origem: dev.codigo, sku: 'SKU-TESTE', situacao: 'Disponível para venda', ean: null, serial: null }]);
  });

  it('respeita o período no horário de Brasília pela conclusão da conferência (não pelo recebimento)', async () => {
    // 23h30 do dia 16 em Brasília (já é dia 17 em UTC); recebida no dia 10.
    const noite = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }], agora: new Date('2026-11-17T02:30:00Z') });
    await db.update(devolucoes).set({ recebidaEm: new Date('2026-11-10T15:00:00Z') }).where(eq(devolucoes.id, noite.id));
    // 00h30 do dia 17 em Brasília (03h30 UTC).
    const madrugada = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }], agora: new Date('2026-11-17T03:30:00Z') });
    const antiga = await criarRetiradaTeste(db, gestor, {
      concluidaEm: new Date('2026-10-01T15:00:00Z'),
      itens: [{ eanLido: '1', descricao: 'Antigo', quantidade: 1 }],
    });

    expect((await listarVoltaAoArmazem(db, HOJE)).map((l) => l.origem)).toEqual([noite.codigo]);
    expect(await listarVoltaAoArmazem(db, { de: '2026-11-10', ate: '2026-11-10' })).toEqual([]);
    expect((await listarVoltaAoArmazem(db, { de: '2026-11-17', ate: '2026-11-17' })).map((l) => l.origem)).toEqual([madrugada.codigo]);
    // Em ordem de data: a retirada de outubro primeiro.
    expect((await listarVoltaAoArmazem(db, { de: '2026-10-01', ate: '2026-11-16' })).map((l) => l.origem)).toEqual([antiga.codigo, noite.codigo]);
  });

  it('SKU, EAN e descrição: produto recebido vence o SKU da venda, EAN lido vence o do cadastro, sem recebido vale o esperado', async () => {
    await criarProdutoTeste(db, { sku: 'VENDIDO-1', ean: '7891111', descricao: 'Produto vendido' });
    const recebido = await criarProdutoTeste(db, { sku: 'RECEBIDO-1', ean: '7892222', descricao: 'Produto que chegou' });
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      unidades: [
        { sku: 'VENDIDO-1', destino: 'BOM', eanLido: '7899999' },
        { sku: 'VENDIDO-1', destino: 'BOM' },
      ],
      agora: DIA_16,
    });
    await db.update(itensDevolucao).set({ produtoRecebidoId: recebido }).where(eq(itensDevolucao.id, dev.itens[0].id));

    expect(await listarVoltaAoArmazem(db, HOJE)).toMatchObject([
      { sku: 'RECEBIDO-1', descricao: 'Produto que chegou', ean: '7899999' },
      { sku: 'VENDIDO-1', descricao: 'Produto vendido', ean: '7891111' },
    ]);
  });

  it('(extra) EAN lido fora do cadastro não aparece como o produto da venda', async () => {
    await criarProdutoTeste(db, { sku: 'VENDIDO-2', ean: '7893333', descricao: 'Produto vendido' });
    await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'VENDIDO-2', destino: 'BOM', eanLido: '7770001' }], agora: DIA_16 });
    expect(await listarVoltaAoArmazem(db, HOJE)).toMatchObject([{ sku: '', descricao: 'Sem cadastro (EAN lido: 7770001)', ean: '7770001' }]);
  });

  it('a página pede as mais recentes primeiro e com limite; o resumo soma tudo', async () => {
    const d1 = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }, { destino: 'BOM' }], agora: new Date('2026-11-16T12:00:00Z') });
    const r1 = await criarRetiradaTeste(db, gestor, {
      concluidaEm: new Date('2026-11-16T13:00:00Z'),
      itens: [{ eanLido: '1', descricao: 'Um', quantidade: 4 }],
    });
    const d2 = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }], agora: new Date('2026-11-16T14:00:00Z') });

    expect((await listarVoltaAoArmazem(db, HOJE, { ordem: 'desc', limite: 2 })).map((l) => l.origem)).toEqual([d2.codigo, r1.codigo]);
    expect((await listarVoltaAoArmazem(db, HOJE, { ordem: 'desc' })).map((l) => l.origem)).toEqual([d2.codigo, r1.codigo, d1.codigo, d1.codigo]);
    expect((await listarVoltaAoArmazem(db, HOJE)).map((l) => l.origem)).toEqual([d1.codigo, d1.codigo, r1.codigo, d2.codigo]);
    expect(await resumirVoltaAoArmazem(db, HOJE)).toEqual({ linhas: 4, unidades: 7 });
    expect(await resumirVoltaAoArmazem(db, { de: '2026-11-17', ate: '2026-11-17' })).toEqual({ linhas: 0, unidades: 0 });
  });
});
