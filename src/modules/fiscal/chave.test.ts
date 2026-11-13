import { describe, expect, it } from 'vitest';
import { chaveValida, montarChave, numeroDaChave, semPrefixoNFe } from './chave';

describe('chave de acesso da NF-e', () => {
  it('o dígito confere com o exemplo do Manual de Orientação do Contribuinte', () => {
    expect(chaveValida('52060433009911002506550120000007800267301615')).toBe(true);
    expect(chaveValida('52060433009911002506550120000007800267301614')).toBe(false);
    expect(chaveValida('5206043300991100250655012000000780026730161')).toBe(false);
    expect(chaveValida('NFe52060433009911002506550120000007800267301615')).toBe(false);
  });

  it('monta UF, ano e mês de Brasília, CNPJ, modelo 55, série, número, emissão normal, código e dígito', () => {
    const chave = montarChave({
      uf: 'SP',
      emitidaEm: new Date('2026-11-12T12:00:00Z'),
      cnpj: '11222333000181',
      serie: '2',
      numero: '123',
      codigo: '12345678',
    });
    expect(chave).toBe('35261111222333000181550020000001231123456783');
    expect(chaveValida(chave)).toBe(true);
    expect(() => montarChave({ uf: 'XX', emitidaEm: new Date(), cnpj: '11222333000181', serie: '1', numero: '1', codigo: '1' })).toThrow('UF desconhecida: XX');
  });

  it('tira o prefixo NFe e lê o número de dentro da chave', () => {
    expect(semPrefixoNFe('NFe35261111222333000181550020000001231123456783')).toBe('35261111222333000181550020000001231123456783');
    expect(numeroDaChave('35261111222333000181550020000001231123456783')).toBe('123');
  });
});
