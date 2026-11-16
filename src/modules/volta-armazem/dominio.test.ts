import { readSheet } from 'read-excel-file/universal';
import { describe, expect, it } from 'vitest';
import { paraArrayBuffer } from '../../../tests/helpers/xlsx';
import { gerarXlsx } from '@/modules/lotes/xlsx';
import {
  atalhosDoPeriodo,
  CARTOES_MAXIMOS,
  COLUNAS_VOLTA,
  hrefDaOrigem,
  lerPeriodo,
  nomeArquivoVolta,
  planilhaVolta,
  SITUACAO_RETIRADA,
  situacaoDaUnidade,
  validarPeriodoVolta,
  type LinhaVolta,
} from './dominio';

// 23h30 do dia 16/11/2026 em Brasília (já é dia 17 em UTC).
const NOITE_DO_DIA_16 = new Date('2026-11-17T02:30:00Z');

describe('período da planilha Volta ao armazém', () => {
  it('padrão hoje em Brasília; De depois de Até e mais de 366 dias são inválidos', () => {
    expect(lerPeriodo({}, NOITE_DO_DIA_16)).toEqual({ de: '2026-11-16', ate: '2026-11-16', valido: true });
    expect(lerPeriodo({ de: '2026-11-01', ate: '2026-11-10' }, NOITE_DO_DIA_16)).toEqual({ de: '2026-11-01', ate: '2026-11-10', valido: true });
    expect(lerPeriodo({ de: '2026-11-17', ate: '2026-11-16' }, NOITE_DO_DIA_16).valido).toBe(false);
    expect(validarPeriodoVolta('2026-11-17', '2026-11-16')).toBe(false);
    expect(validarPeriodoVolta('2025-11-15', '2026-11-16')).toBe(false); // 367 dias
    expect(validarPeriodoVolta('2025-11-16', '2026-11-16')).toBe(true); // 366 dias
    expect(validarPeriodoVolta('2026-11-16', '2026-11-16')).toBe(true);
    expect(validarPeriodoVolta('2026-02-30', '2026-03-01')).toBe(false);
    expect(validarPeriodoVolta('16/11/2026', '2026-11-16')).toBe(false);
    expect(validarPeriodoVolta('', '')).toBe(false);
  });

  it('atalhos: Hoje, Últimos 7 dias e Este mês', () => {
    expect(atalhosDoPeriodo(NOITE_DO_DIA_16)).toEqual([
      { rotulo: 'Hoje', de: '2026-11-16', ate: '2026-11-16' },
      { rotulo: 'Últimos 7 dias', de: '2026-11-10', ate: '2026-11-16' },
      { rotulo: 'Este mês', de: '2026-11-01', ate: '2026-11-16' },
    ]);
  });
});

describe('Situação, nome do arquivo e origem', () => {
  it('rótulos da spec e o rótulo do próprio status nos outros', () => {
    expect(situacaoDaUnidade('AGUARDANDO_NF')).toBe('Aguardando NF');
    expect(situacaoDaUnidade('DISPONIVEL_VENDA')).toBe('Disponível para venda');
    expect(situacaoDaUnidade('EM_LOTE')).toBe('Em lote');
    expect(SITUACAO_RETIRADA).toBe('Retirada do Full');
  });

  it('nome do arquivo com o período', () => {
    expect(nomeArquivoVolta({ de: '2026-11-01', ate: '2026-11-16' })).toBe('volta-ao-armazem_2026-11-01_a_2026-11-16.xlsx');
  });

  it('a origem leva à devolução ou à retirada', () => {
    expect(hrefDaOrigem({ tipo: 'DEVOLUCAO', origem: 'DEV-000123' })).toBe('/fluxo/devolucoes/DEV-000123');
    expect(hrefDaOrigem({ tipo: 'RETIRADA', origem: 'RF-000001' })).toBe('/fluxo/retiradas-full/RF-000001');
  });

  it('a página mostra no máximo 200 cartões (extra)', () => {
    expect(CARTOES_MAXIMOS).toBe(200);
  });
});

describe('planilhaVolta (relida do .xlsx)', () => {
  it('o cabeçalho traz o período e as colunas vêm na ordem da spec', async () => {
    const linhas: LinhaVolta[] = [
      {
        chave: 'i1',
        tipo: 'DEVOLUCAO',
        data: new Date('2026-11-16T17:32:00Z'),
        origem: 'DEV-000123',
        sku: 'SKU-1',
        descricao: 'Fone',
        ean: '789',
        quantidade: 1,
        situacao: 'Aguardando NF',
        serial: 'SN-1',
      },
      {
        chave: 'r1',
        tipo: 'RETIRADA',
        data: new Date('2026-11-16T18:00:00Z'),
        origem: 'RF-000001',
        sku: '',
        descricao: '=SOMA(1)',
        ean: null,
        quantidade: 3,
        situacao: SITUACAO_RETIRADA,
        serial: null,
      },
    ];
    const lidas = await readSheet(paraArrayBuffer(gerarXlsx('Volta ao armazém', planilhaVolta({ de: '2026-11-01', ate: '2026-11-16' }, linhas))));
    expect(lidas[0][0]).toBe('Volta ao armazém');
    expect(lidas[1].slice(0, 2)).toEqual(['Período', '01/11/2026 a 16/11/2026']);
    expect(lidas[3]).toEqual([...COLUNAS_VOLTA]);
    expect(COLUNAS_VOLTA).toEqual(['Data', 'Origem', 'SKU', 'Descrição', 'EAN', 'Quantidade', 'Situação', 'Nº de série']);
    expect(lidas[4]).toEqual(['16/11/2026 14:32', 'DEV-000123', 'SKU-1', 'Fone', '789', 1, 'Aguardando NF', 'SN-1']);
    expect(lidas[5]).toEqual(['16/11/2026 15:00', 'RF-000001', null, '=SOMA(1)', null, 3, 'Retirada do Full', null]);
  });
});
