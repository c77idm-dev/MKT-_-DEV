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
    for (const texto of ['DEV-000001', 'Shopee', 'Fone Bluetooth + 2 unidades', 'BR123', 'Entregue (ML)', 'Pendente de chegada']) {
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

describe('CartaoDevolucao na etapa 4', () => {
  it('mostra quantas unidades vão para Estoque Bom e Estoque Problema (spec §6.4)', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, status: 'AGUARDANDO_NF', selos: [], destinos: { bom: 2, problema: 1 } }} />);
    expect(screen.getByText('Estoque Bom: 2')).toBeTruthy();
    expect(screen.getByText('Estoque Problema: 1')).toBeTruthy();
  });

  it('sem unidades aguardando NF, nada de contagem', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, selos: [], destinos: { bom: 0, problema: 0 } }} />);
    expect(screen.queryByText(/^Estoque/)).toBeNull();
  });
});
