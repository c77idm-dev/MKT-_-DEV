// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Paginacao } from './Paginacao';

describe('Paginacao', () => {
  it('mostra a página atual e os links de anterior e próxima', () => {
    render(<Paginacao pagina={2} total={120} porPagina={50} hrefDaPagina={(p) => `/lista?pagina=${p}`} />);
    expect(screen.getByText('Página 2 de 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Anterior' }).getAttribute('href')).toBe('/lista?pagina=1');
    expect(screen.getByRole('link', { name: 'Próxima' }).getAttribute('href')).toBe('/lista?pagina=3');
  });

  it('não aparece quando cabe numa página só', () => {
    const { container } = render(<Paginacao pagina={1} total={10} porPagina={50} hrefDaPagina={(p) => `/x?pagina=${p}`} />);
    expect(container.innerHTML).toBe('');
  });
});
