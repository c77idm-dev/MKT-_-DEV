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

  it('tom claro é o padrão (barras brancas); tom escuro é para fundo claro', () => {
    const { container: claro } = render(<FaixaCodigoBarras legenda="A" />);
    expect(claro.firstElementChild!.getAttribute('data-tom')).toBe('claro');
    const { container: escuro } = render(<FaixaCodigoBarras legenda="B" tom="escuro" />);
    expect(escuro.firstElementChild!.getAttribute('data-tom')).toBe('escuro');
  });
});
