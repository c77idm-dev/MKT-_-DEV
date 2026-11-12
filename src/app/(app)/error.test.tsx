// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErroDaArea from './error';

describe('ErroDaArea', () => {
  it('fala português, não mostra detalhes do erro e oferece as duas saídas', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const retry = vi.fn();
    render(<ErroDaArea error={new Error('segredo interno do servidor')} retry={retry} />);
    expect(screen.getByText('Algo deu errado.')).toBeTruthy();
    expect(screen.queryByText(/segredo interno/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Voltar ao Fluxo' }).getAttribute('href')).toBe('/fluxo');
  });
});
