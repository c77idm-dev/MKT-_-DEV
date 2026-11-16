import { describe, expect, it } from 'vitest';
import {
  decidirLeitura,
  ehCodigoRetirada,
  normalizarEan,
  novaQuantidade,
  pendenciasParaConcluir,
  ROTULO_SITUACAO_RETIRADA,
  validarDescricao,
} from './dominio';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

describe('retirada do Full: regras puras', () => {
  it('o EAN de um produto que já está num item soma nele', () => {
    const itens = [{ id: 'a', produtoId: P1, eanLido: '789' }];
    expect(decidirLeitura(itens, '789', P1)).toEqual({ tipo: 'somar', itemId: 'a' });
  });

  it('um produto do cadastro que ainda não está na retirada vira item novo', () => {
    expect(decidirLeitura([{ id: 'a', produtoId: P1, eanLido: '789' }], '790', P2)).toEqual({ tipo: 'novo_produto', produtoId: P2 });
  });

  it('EAN sem cadastro já incluído soma sem pedir a descrição de novo', () => {
    const itens = [{ id: 'b', produtoId: null, eanLido: '555' }];
    expect(decidirLeitura(itens, '555', null)).toEqual({ tipo: 'somar', itemId: 'b' });
  });

  it('EAN sem cadastro novo pede a descrição', () => {
    expect(decidirLeitura([{ id: 'a', produtoId: P1, eanLido: '555' }], '555', null)).toEqual({ tipo: 'pedir_descricao' });
  });

  it('a quantidade fica entre 1 e 9999', () => {
    expect(novaQuantidade(1, -1)).toBe(1);
    expect(novaQuantidade(2, -1)).toBe(1);
    expect(novaQuantidade(2, 1)).toBe(3);
    expect(novaQuantidade(9999, 1)).toBe(9999);
  });

  it('descrição curta: tira espaços e exige de 1 a 120 caracteres', () => {
    expect(validarDescricao('  ')).toBeNull();
    expect(validarDescricao('  Cabo USB  ')).toBe('Cabo USB');
    expect(validarDescricao('x'.repeat(121))).toBeNull();
  });

  it('concluir exige a foto da etiqueta e pelo menos 1 item', () => {
    expect(pendenciasParaConcluir({ fotoEtiqueta: false, itens: 0 })).toEqual(['Tire a foto da etiqueta.', 'Bipe pelo menos 1 produto.']);
    expect(pendenciasParaConcluir({ fotoEtiqueta: true, itens: 0 })).toEqual(['Bipe pelo menos 1 produto.']);
    expect(pendenciasParaConcluir({ fotoEtiqueta: true, itens: 2 })).toEqual([]);
  });

  it('código RF e EAN normalizado', () => {
    expect(ehCodigoRetirada('RF-000001')).toBe(true);
    expect(ehCodigoRetirada('RF-1234567')).toBe(true);
    expect(ehCodigoRetirada('DEV-000001')).toBe(false);
    expect(ehCodigoRetirada('RF-12')).toBe(false);
    expect(normalizarEan(' 789 100 0000014 ')).toBe('7891000000014');
    expect(normalizarEan('abc')).toBe('ABC');
    expect(ROTULO_SITUACAO_RETIRADA).toEqual({ ABERTA: 'Aberta', CONFERIDA: 'Conferida' });
  });
});
