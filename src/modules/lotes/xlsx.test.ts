import { readSheet } from 'read-excel-file/universal';
import { describe, expect, it } from 'vitest';
import { paraArrayBuffer } from '../../../tests/helpers/xlsx';
import { gerarXlsx } from './xlsx';

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
