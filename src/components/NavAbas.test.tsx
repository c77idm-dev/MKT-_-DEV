// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ caminho: '/fluxo' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.caminho }));

import { NavAbas } from './NavAbas';

const ABAS = [
  { rotulo: 'Fluxo', href: '/fluxo' },
  { rotulo: 'Lotes e Remessas', href: '/lotes' },
];

describe('NavAbas', () => {
  it('marca como atual a aba da página aberta, inclusive em subpáginas', () => {
    mocks.caminho = '/lotes/123';
    render(<NavAbas abas={ABAS} />);
    expect(screen.getByRole('link', { name: 'Lotes e Remessas' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Fluxo' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('NavAbas no celular', () => {
  it('cada aba tem ícone e nome, e a navegação "Seções" é uma barra fixa', () => {
    mocks.caminho = '/fluxo';
    render(<NavAbas abas={ABAS} />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Fluxo', 'Lotes e Remessas']);
    for (const link of links) {
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    expect(screen.getByRole('navigation', { name: 'Seções' }).className).toContain('fixed');
  });
});
