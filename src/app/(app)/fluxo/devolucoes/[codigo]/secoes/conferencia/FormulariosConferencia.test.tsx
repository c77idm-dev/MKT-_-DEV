// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormularioLiberarTrava } from './FormulariosConferencia';

describe('FormularioLiberarTrava (precisa de confirmação)', () => {
  it('o primeiro toque só abre a confirmação; a ação roda no "Confirmar liberação"', async () => {
    const acao = vi.fn(async () => ({ erros: [] }));
    render(<FormularioLiberarTrava acao={acao} conferente="Ana" />);
    fireEvent.click(screen.getByRole('button', { name: 'Liberar trava' }));
    expect(acao).not.toHaveBeenCalled();
    expect(screen.getByText(/tira a conferência de Ana/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar liberação' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
  });

  it('"Cancelar" volta ao botão inicial sem chamar a ação', () => {
    const acao = vi.fn(async () => ({ erros: [] }));
    render(<FormularioLiberarTrava acao={acao} conferente="Ana" />);
    fireEvent.click(screen.getByRole('button', { name: 'Liberar trava' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Liberar trava' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar liberação' })).toBeNull();
    expect(acao).not.toHaveBeenCalled();
  });
});
