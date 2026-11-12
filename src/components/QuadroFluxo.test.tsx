// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { QuadroFluxo } from './QuadroFluxo';

const CARTAO: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'SHOPEE',
  status: 'PENDENTE_CHEGADA',
  rastreio: 'BR123',
  pedidos: ['SHP-1'],
  produto: 'Fone Bluetooth',
  unidades: 1,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: null,
  selos: [],
};
const ETAPA_1 = 'Pedidos Pendentes de Chegada';

describe('QuadroFluxo', () => {
  it('mostra uma coluna por etapa do PDF, com título, total e aviso de vazio', () => {
    render(<QuadroFluxo colunas={ETAPAS.map((e) => ({ numero: e.numero, titulo: e.titulo, total: 0 }))} />);
    for (const etapa of ETAPAS) {
      expect(screen.getByRole('heading', { level: 2, name: etapa.titulo })).toBeTruthy();
    }
    expect(screen.getAllByText('Nenhuma devolução nesta etapa.')).toHaveLength(5);
  });

  it('o total da coluna tem texto para o leitor de tela', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: ETAPA_1, total: 3 }]} />);
    expect(screen.queryByText('Nenhuma devolução nesta etapa.')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('3 devoluções')).toBeTruthy();
  });

  it('mostra os cartões e o link "+ N devoluções" para a lista da etapa', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: ETAPA_1, total: 7, cartoes: [CARTAO], href: '/fluxo/etapa/1' }]} />);
    expect(screen.getByRole('link', { name: /DEV-000001/ }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000001');
    expect(screen.getByRole('link', { name: `+ 6 devoluções em ${ETAPA_1}` }).getAttribute('href')).toBe('/fluxo/etapa/1');
  });

  it('quando todos os cartões cabem, o link é "Ver lista"', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: ETAPA_1, total: 1, cartoes: [CARTAO], href: '/fluxo/etapa/1' }]} />);
    expect(screen.getByRole('link', { name: `Ver lista: ${ETAPA_1}` })).toBeTruthy();
  });

  it('a coluna com nota mostra a nota em vez do aviso de vazio', () => {
    render(<QuadroFluxo colunas={[{ numero: 5, titulo: 'Agrupamento por Fornecedor', total: 0, nota: 'Lotes chegam depois.' }]} />);
    expect(screen.getByText('Lotes chegam depois.')).toBeTruthy();
    expect(screen.queryByText('Nenhuma devolução nesta etapa.')).toBeNull();
  });
});
