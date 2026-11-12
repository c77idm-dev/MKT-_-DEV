// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { CartaoDevolucao } from './CartaoDevolucao';

const BASE: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'SHOPEE',
  status: 'PENDENTE_CHEGADA',
  rastreio: 'BR123',
  pedidos: ['SHP-1'],
  produto: 'Fone Bluetooth',
  unidades: 3,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: null,
  selos: [{ texto: 'Entregue (ML)', tom: 'atencao' }],
};

describe('CartaoDevolucao', () => {
  it('mostra código, canal, produto, rastreio e selos, e o cartão inteiro leva ao detalhe', () => {
    render(<CartaoDevolucao devolucao={BASE} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000001');
    for (const texto of ['DEV-000001', 'Shopee', 'Fone Bluetooth + 2 unidades', 'BR123', 'Entregue (ML)']) {
      expect(screen.getByText(texto)).toBeTruthy();
    }
  });

  it('pacote não identificado, sem canal e sem itens', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, canal: null, produto: null, unidades: 0, rastreio: null, selos: [] }} />);
    expect(screen.getByText('Canal a identificar')).toBeTruthy();
    expect(screen.getByText('Sem itens cadastrados')).toBeTruthy();
    expect(screen.getByText('Sem rastreio')).toBeTruthy();
  });
});
