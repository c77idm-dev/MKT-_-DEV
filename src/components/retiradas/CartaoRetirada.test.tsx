// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RetiradaLista } from '@/modules/retiradas/consultas';
import { CartaoRetirada } from './CartaoRetirada';

const BASE: RetiradaLista = {
  id: 'r1',
  codigo: 'RF-000001',
  codigoEtiqueta: 'FULL123',
  situacao: 'CONFERIDA',
  recebidaEm: new Date('2026-11-16T15:30:00Z'),
  concluidaEm: new Date('2026-11-16T16:00:00Z'),
  recebidaPorNome: 'Ana',
  totalItens: 3,
};

afterEach(cleanup);

describe('CartaoRetirada (lista "Retiradas do Full")', () => {
  it('o cartão inteiro é o link, com o código RF primeiro, a etiqueta, a situação, os itens e quem recebeu', () => {
    render(<CartaoRetirada retirada={BASE} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/fluxo/retiradas-full/RF-000001');
    expect(link.textContent?.startsWith('RF-000001')).toBe(true);
    expect(link.textContent).toContain('Conferida');
    expect(link.textContent).toContain('Etiqueta: FULL123');
    expect(link.textContent).toContain('3 itens');
    expect(link.textContent).toContain('Recebida por Ana');
    expect(link.textContent).toContain('16/11');
  });

  it('singular e situação Aberta', () => {
    render(<CartaoRetirada retirada={{ ...BASE, situacao: 'ABERTA', concluidaEm: null, totalItens: 1, recebidaPorNome: null }} />);
    const link = screen.getByRole('link');
    expect(link.textContent).toContain('Aberta');
    expect(link.textContent).toContain('1 item');
    expect(link.textContent).toContain('Recebida por usuário removido');
  });
});
