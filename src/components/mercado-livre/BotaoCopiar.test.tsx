// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoCopiar } from './BotaoCopiar';

function areaDeTransferencia(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}
afterEach(() => vi.restoreAllMocks());

describe('BotaoCopiar', () => {
  it('copia o texto e avisa em role=status', async () => {
    const writeText = vi.fn(async () => {});
    areaDeTransferencia(writeText);
    render(<BotaoCopiar texto="Mensagem para o ML" rotuloCopiado="Mensagem copiada." />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect((await screen.findByRole('status')).textContent).toBe('Mensagem copiada.');
    expect(writeText).toHaveBeenCalledWith('Mensagem para o ML');
  });

  it('sem permissão para copiar: explica como copiar à mão', async () => {
    areaDeTransferencia(async () => {
      throw new Error('negado');
    });
    render(<BotaoCopiar texto="x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect((await screen.findByText(/Toque e segure na mensagem para copiar/)).getAttribute('role')).toBe('status');
  });
});
