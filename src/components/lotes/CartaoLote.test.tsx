// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartaoLote } from './CartaoLote';

describe('CartaoLote', () => {
  it('mostra código, fornecedor, status, tipo, unidades e o selo da NF', () => {
    render(
      <CartaoLote
        href="/lotes/LOT-000045"
        lote={{ id: 'l1', codigo: 'LOT-000045', fornecedor: 'Peças Brasil Ltda', status: 'FECHADO', rotuloStatus: 'Fechado', tom: 'atencao', tipo: 'Conserto', unidades: 3, seloNota: { texto: 'NF rejeitada', tom: 'erro' } }}
      />,
    );
    const link = screen.getByRole('link', { name: /^LOT-000045/ });
    expect((link).getAttribute('href')).toBe('/lotes/LOT-000045');
    expect((link).textContent).toContain('Peças Brasil Ltda');
    expect((link).textContent).toContain('Fechado');
    expect((link).textContent).toContain('Conserto');
    expect((link).textContent).toContain('3 unidades');
    expect((link).textContent).toContain('NF rejeitada');
  });

  it('uma unidade no singular e sem tipo enquanto aberto', () => {
    render(<CartaoLote href="/lotes/LOT-000001" lote={{ id: 'l', codigo: 'LOT-000001', fornecedor: 'F', status: 'ABERTO', rotuloStatus: 'Aberto', tom: 'destaque', tipo: null, unidades: 1, seloNota: null }} />);
    expect((screen.getByRole('link')).textContent).toContain('1 unidade');
    expect((screen.getByRole('link')).textContent).not.toContain('unidades');
  });
});
