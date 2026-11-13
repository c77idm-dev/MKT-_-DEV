import { describe, expect, it } from 'vitest';
import { casarItens, chaveAlvo, lerChaveAlvo, vagasRestantes, type NotaVendaParaCasar, type UnidadeParaCasar } from './casamento';

const NOTA_A = '11111111-1111-4111-8111-111111111111';
const NOTA_B = '22222222-2222-4222-8222-222222222222';

function item(numero: number, codigo: string, quantidade: number, ean: string | null = null, escolhidos: string[] = []) {
  return { numero, codigo, ean, quantidade, itensDevolucaoIds: escolhidos };
}
function unidade(itemId: string, n: number, sku: string, ean: string | null = null): UnidadeParaCasar {
  return { itemId, unidade: n, sku, ean };
}

describe('casarItens (D14)', () => {
  it('pelo SKU (sem diferenciar maiúsculas), depois pelo EAN, respeitando a quantidade vendida; o resto fica sem par', () => {
    const notas: NotaVendaParaCasar[] = [{ notaVendaId: NOTA_A, itens: [item(1, 'fone-01', 2), item(2, 'CABO-ORIGINAL', 1, '7891234567895')] }];
    const unidades = [unidade('a', 1, 'FONE-01'), unidade('b', 2, 'FONE-01'), unidade('c', 3, 'FONE-01'), unidade('d', 4, 'CABO-02', '7891234567895')];
    expect(casarItens(unidades, notas)).toEqual([
      { itemId: 'a', alvo: { notaVendaId: NOTA_A, numeroItem: 1 }, por: 'SKU' },
      { itemId: 'b', alvo: { notaVendaId: NOTA_A, numeroItem: 1 }, por: 'SKU' },
      { itemId: 'c', alvo: null, por: null },
      { itemId: 'd', alvo: { notaVendaId: NOTA_A, numeroItem: 2 }, por: 'EAN' },
    ]);
  });

  it('a escolha do Fiscal vem antes de tudo e ocupa a vaga', () => {
    const notas: NotaVendaParaCasar[] = [{ notaVendaId: NOTA_A, itens: [item(1, 'FONE-01', 1, null, ['b'])] }];
    expect(casarItens([unidade('a', 1, 'FONE-01'), unidade('b', 2, 'OUTRO')], notas)).toEqual([
      { itemId: 'a', alvo: null, por: null },
      { itemId: 'b', alvo: { notaVendaId: NOTA_A, numeroItem: 1 }, por: 'ESCOLHA' },
    ]);
  });

  it('procura em todas as NF de venda da devolução (vários pedidos)', () => {
    const notas: NotaVendaParaCasar[] = [
      { notaVendaId: NOTA_A, itens: [item(1, 'FONE-01', 1)] },
      { notaVendaId: NOTA_B, itens: [item(1, 'FONE-01', 1)] },
    ];
    expect(casarItens([unidade('a', 1, 'FONE-01'), unidade('b', 2, 'FONE-01')], notas).map((r) => r.alvo?.notaVendaId)).toEqual([NOTA_A, NOTA_B]);
  });

  it('chave do alvo (valor do select da tela) e vagas que sobram', () => {
    expect(chaveAlvo({ notaVendaId: NOTA_A, numeroItem: 2 })).toBe(`${NOTA_A}:2`);
    expect(lerChaveAlvo(`${NOTA_A.toUpperCase()}:2`)).toEqual({ notaVendaId: NOTA_A, numeroItem: 2 });
    expect(lerChaveAlvo('qualquer-coisa:2')).toBeNull();
    const notas: NotaVendaParaCasar[] = [{ notaVendaId: NOTA_A, itens: [item(1, 'FONE-01', 3), item(2, 'X', 1.5)] }];
    const vagas = vagasRestantes(notas, casarItens([unidade('a', 1, 'FONE-01')], notas));
    expect(Object.fromEntries(vagas)).toEqual({ [`${NOTA_A}:1`]: 2, [`${NOTA_A}:2`]: 1 });
  });
});
