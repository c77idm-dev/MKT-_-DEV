// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FaixaCodigoBarras } from './FaixaCodigoBarras';

describe('FaixaCodigoBarras (decorativa)', () => {
  it('mostra a legenda e esconde tudo do leitor de tela', () => {
    const { container } = render(<FaixaCodigoBarras legenda="DEV · CONFERÊNCIA · NF" />);
    expect(screen.getByText('DEV · CONFERÊNCIA · NF')).toBeTruthy();
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.getAttribute('aria-hidden')).toBe('true');
    expect(raiz.querySelector('[data-barras]')).toBeTruthy();
  });

  it('sem legenda, só as barras', () => {
    const { container } = render(<FaixaCodigoBarras />);
    expect(container.querySelector('[data-legenda]')).toBeNull();
    expect(container.querySelector('[data-barras]')).toBeTruthy();
  });

  it('tom claro (padrão) usa barras brancas; tom escuro usa a cor do texto', () => {
    const { container: claro } = render(<FaixaCodigoBarras legenda="A" />);
    const barrasClaras = claro.querySelector('[data-barras]') as HTMLElement;
    expect(claro.firstElementChild!.getAttribute('data-tom')).toBe('claro');
    expect(barrasClaras.className).toContain('text-white/85');

    const { container: escuro } = render(<FaixaCodigoBarras legenda="B" tom="escuro" />);
    const barrasEscuras = escuro.querySelector('[data-barras]') as HTMLElement;
    expect(escuro.firstElementChild!.getAttribute('data-tom')).toBe('escuro');
    expect(barrasEscuras.className).toContain('text-texto');
    expect(barrasEscuras.className).not.toContain('text-white');
  });
});
