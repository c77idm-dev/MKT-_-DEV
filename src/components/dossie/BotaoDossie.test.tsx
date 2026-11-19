// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotaoDossie } from './BotaoDossie';

/** O jsdom não baixa arquivos: segura a navegação do link e guarda se o componente já tinha cancelado o toque. */
const cancelados: boolean[] = [];
function aoClicarNaJanela(evento: Event) {
  cancelados.push(evento.defaultPrevented);
  evento.preventDefault();
}
beforeEach(() => {
  cancelados.length = 0;
  window.addEventListener('click', aoClicarNaJanela);
});
afterEach(() => {
  window.removeEventListener('click', aoClicarNaJanela);
  cleanup();
  vi.useRealTimers();
});

describe('BotaoDossie (extra)', () => {
  it('link de download para a rota do dossiê, com a dica ligada ao link', () => {
    render(<BotaoDossie codigo="DEV-000123" />);
    const link = screen.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
    expect(link.getAttribute('href')).toBe('/api/devolucoes/DEV-000123/dossie');
    expect(link.getAttribute('download')).toBe('dossie-DEV-000123.pdf');
    const dica = document.getElementById(link.getAttribute('aria-describedby')!);
    expect(dica?.textContent).toBe('(extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('ao tocar: avisa que está gerando e segura toques repetidos; depois de um tempo libera de novo', () => {
    vi.useFakeTimers();
    render(<BotaoDossie codigo="DEV-000123" />);
    const link = screen.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
    fireEvent.click(link);
    expect(screen.getByRole('status').textContent).toBe('Gerando o PDF… o download começa em instantes.');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(link);
    expect(cancelados).toEqual([false, true]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(link.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(link);
    expect(cancelados).toEqual([false, true, false]);
  });
});
