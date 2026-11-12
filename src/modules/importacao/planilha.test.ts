import { describe, expect, it } from 'vitest';
import { criarXlsx, paraArrayBuffer } from '../../../tests/helpers/xlsx';
import { ErroPlanilha, lerCsv, lerPlanilha, MAX_LINHAS, montarPlanilha } from './planilha';

const utf8 = (texto: string) => paraArrayBuffer(new TextEncoder().encode(texto));

describe('lerPlanilha: CSV', () => {
  it('lê CSV com ";", BOM, aspas e linha vazia no meio', async () => {
    const csv = '﻿sku;descricao;custo\r\nA1;"Fone; sem fio";1.234,56\r\n\r\nB2;Cabo;\r\n';
    expect(await lerPlanilha('produtos.csv', utf8(csv))).toEqual({
      linhaCabecalho: 1,
      cabecalhos: ['sku', 'descricao', 'custo'],
      linhas: [
        ['A1', 'Fone; sem fio', '1.234,56'],
        ['', '', ''],
        ['B2', 'Cabo', ''],
      ],
    });
  });

  it('lê CSV com "," e CSV salvo em Windows-1252 pelo Excel', async () => {
    expect((await lerPlanilha('a.csv', utf8('a,b\n1,2\n'))).linhas).toEqual([['1', '2']]);
    const latin1 = Uint8Array.from('Código;Descrição\r\nA1;Pão\r\n', (c) => c.charCodeAt(0));
    expect(await lerPlanilha('b.csv', paraArrayBuffer(latin1))).toEqual({ cabecalhos: ['Código', 'Descrição'], linhas: [['A1', 'Pão']], linhaCabecalho: 1 });
  });

  it('dá nome às colunas sem título e diferencia nomes repetidos', async () => {
    const r = await lerPlanilha('c.csv', utf8('SKU;;SKU\nA;B;C\n'));
    expect(r.cabecalhos).toEqual(['SKU', 'Coluna 2', 'SKU (2)']);
  });
});

describe('lerPlanilha: XLSX', () => {
  it('lê a primeira aba, com números como texto (sem perder dígitos)', async () => {
    const xlsx = criarXlsx([
      ['Código', 'Descrição', 'Custo', 'GTIN'],
      ['SKU-1', 'Fone', 12.5, 7891234567895],
      ['SKU-2', 'Cabo & Cia', null, '0789'],
    ]);
    expect(await lerPlanilha('produtos.xlsx', xlsx)).toEqual({
      linhaCabecalho: 1,
      cabecalhos: ['Código', 'Descrição', 'Custo', 'GTIN'],
      linhas: [
        ['SKU-1', 'Fone', '12.5', '7891234567895'],
        ['SKU-2', 'Cabo & Cia', '', '0789'],
      ],
    });
  });

  it('explica quando o arquivo .xlsx não é uma planilha', async () => {
    await expect(lerPlanilha('falso.xlsx', utf8('isto não é xlsx'))).rejects.toThrow(
      new ErroPlanilha('Não foi possível ler o arquivo .xlsx. Abra no Excel, salve de novo e tente outra vez.'),
    );
  });
});

describe('lerPlanilha: recusas', () => {
  it('recusa .xls antigo e outras extensões', async () => {
    await expect(lerPlanilha('velho.xls', utf8('x'))).rejects.toThrow(
      'Arquivos .xls (Excel antigo) não são aceitos. No Excel, use "Salvar como" .xlsx ou .csv.',
    );
    await expect(lerPlanilha('foto.jpg', utf8('x'))).rejects.toThrow('Envie um arquivo .csv ou .xlsx.');
  });

  it('recusa planilha vazia, só com cabeçalho e grande demais', async () => {
    await expect(lerPlanilha('v.csv', utf8('\n\n'))).rejects.toThrow('A planilha está vazia.');
    await expect(lerPlanilha('c.csv', utf8('sku;descricao\n'))).rejects.toThrow('A planilha só tem a linha dos nomes das colunas.');
    const grande = `sku\n${'A\n'.repeat(MAX_LINHAS + 1)}`;
    await expect(lerPlanilha('g.csv', utf8(grande))).rejects.toThrow(`A planilha tem ${MAX_LINHAS + 1} linhas; o limite é ${MAX_LINHAS}. Divida o arquivo.`);
  });
});

describe('montarPlanilha: linhas em branco no início', () => {
  it('pula linhas totalmente vazias antes do cabeçalho e guarda a linha real dele', () => {
    const r = montarPlanilha([[], ['', ' '], ['sku', 'descricao'], ['A1', 'Fone']]);
    expect(r.cabecalhos).toEqual(['sku', 'descricao']);
    expect(r.linhas).toEqual([['A1', 'Fone']]);
    expect(r.linhaCabecalho).toBe(3);
  });

  it('sem linhas em branco o cabeçalho é a linha 1', () => {
    expect(montarPlanilha([['sku'], ['A1']]).linhaCabecalho).toBe(1);
  });
});

describe('lerCsv: aspas sem fechamento', () => {
  it('explica o erro e a linha', () => {
    expect(() => lerCsv('sku;descricao\nA1;"Fone sem fechar\nB2;Cabo\n')).toThrow(
      new ErroPlanilha('Aspas sem fechamento na linha 2 — confira o arquivo'),
    );
  });
});
