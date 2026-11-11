import { describe, expect, it } from 'vitest';
import { ETAPAS } from './etapas';

describe('ETAPAS', () => {
  it('lista as 5 etapas com os nomes exatos do PDF, em ordem', () => {
    expect(ETAPAS.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(ETAPAS.map((e) => e.titulo)).toEqual([
      'Pedidos Pendentes de Chegada',
      'Pedidos Chegados - Aguardando Conferência',
      'Em Conferência / Triagem & Registro de Evidências',
      'Destinação Fiscal e Estoque',
      'Agrupamento por Fornecedor (Remessas)',
    ]);
  });
});
