import { readSheet } from 'read-excel-file/universal';
import { describe, expect, it } from 'vitest';
import { paraArrayBuffer } from '../../../tests/helpers/xlsx';
import { COLUNAS_LISTA, type ListaConsolidada } from './lista-consolidada';
import { gerarXlsx, planilhaDaLista } from './xlsx';

describe('gerarXlsx (Excel da lista consolidada)', () => {
  it('o Excel lê de volta os textos, os números e os acentos', async () => {
    const bytes = gerarXlsx('Lista consolidada', [
      ['Fornecedor', 'Peças & Cia <Ltda>'],
      [],
      ['Devolução', 'Unidade', 'Nº de série'],
      ['DEV-000123', 2, 'SN-ÇÃO-1'],
    ]);
    const linhas = await readSheet(paraArrayBuffer(bytes));
    expect(linhas[0].slice(0, 2)).toEqual(['Fornecedor', 'Peças & Cia <Ltda>']); // o leitor completa a linha com null até a largura da aba
    expect(linhas.at(-1)).toEqual(['DEV-000123', 2, 'SN-ÇÃO-1']);
  });

  it('texto que começa com "=" fica texto (nunca vira fórmula) e caractere inválido no XML some', async () => {
    const linhas = await readSheet(paraArrayBuffer(gerarXlsx('Aba', [['=HYPERLINK("x")', 'a\u0001b']])));
    expect(linhas[0]).toEqual(['=HYPERLINK("x")', 'ab']);
  });
});

describe('planilhaDaLista (ordem das colunas da spec 6.5)', () => {
  it('cada valor cai na coluna do seu cabecalho', () => {
    const lista: ListaConsolidada = {
      lote: { codigo: 'LOT-000001', tipo: 'Conserto' },
      fornecedor: { razaoSocial: 'F', cnpj: '1', contatoSac: 'c', emailSac: 'e' },
      nota: { numero: '1', serie: '1', chave: 'k', autorizadaEm: 'a' },
      geradaEm: 'g',
      linhas: [{ devolucao: 'DEV-1', unidade: 2, sku: 'SKU-1', descricao: 'Desc', serial: 'SN-9', motivo: 'Avariado', observacao: 'obs' }],
    };
    const plan = planilhaDaLista(lista);
    expect(plan.at(-2)).toEqual([...COLUNAS_LISTA]);
    expect(plan.at(-1)).toEqual(['SKU-1', 'Desc', 'SN-9', 'Avariado', 'DEV-1', 2, 'obs']);
  });
});
