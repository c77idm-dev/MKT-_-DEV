import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  formatarCnpj,
  normalizarCep,
  normalizarCnpj,
  normalizarEan,
  normalizarNcm,
  normalizarSku,
  normalizarUf,
  somenteAlfanumericos,
} from './documentos';

describe('somenteAlfanumericos', () => {
  it('põe em maiúsculas e mantém só 0-9 e A-Z', () => {
    expect(somenteAlfanumericos('12.abc.345/01-de')).toBe('12ABC34501DE');
    expect(somenteAlfanumericos(' ç-á ')).toBe('');
  });
});

describe('CNPJ', () => {
  it('aceita CNPJ numérico com ou sem pontuação', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizarCnpj('12345678000195')).toBe('12345678000195');
  });

  it('aceita o CNPJ alfanumérico (IN RFB 2.229/2024)', () => {
    expect(normalizarCnpj('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('repõe os zeros à esquerda que o Excel come', () => {
    expect(normalizarCnpj('1122233000120')).toBe('01122233000120');
  });

  it('recusa dígito verificador errado, tamanho errado e números repetidos', () => {
    expect(normalizarCnpj('11.222.333/0001-82')).toBeNull();
    expect(normalizarCnpj('1122233')).toBeNull();
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('formata para exibição', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('EAN / GTIN', () => {
  it('aceita GTIN-13 e GTIN-8 com dígito certo', () => {
    expect(normalizarEan('7891234567895')).toBe('7891234567895');
    expect(normalizarEan(' 789 1000 000014 ')).toBe('7891000000014');
    expect(normalizarEan('96385074')).toBe('96385074');
  });

  it('recusa dígito errado e tamanho estranho', () => {
    expect(normalizarEan('7891234567890')).toBeNull();
    expect(normalizarEan('12345')).toBeNull();
  });
});

describe('NCM, CEP, UF e SKU', () => {
  it('NCM tem 8 dígitos', () => {
    expect(normalizarNcm('8518.30.00')).toBe('85183000');
    expect(normalizarNcm('8518')).toBeNull();
  });

  it('CEP tem 8 dígitos e recupera o zero da esquerda', () => {
    expect(normalizarCep('01310-100')).toBe('01310100');
    expect(normalizarCep('1310100')).toBe('01310100');
    expect(normalizarCep('123')).toBeNull();
  });

  it('UF é uma das 27', () => {
    expect(normalizarUf(' sp ')).toBe('SP');
    expect(normalizarUf('XX')).toBeNull();
  });

  it('SKU fica aparado e em maiúsculas', () => {
    expect(normalizarSku('  fone-01 ')).toBe('FONE-01');
  });
});
