// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoConfirmar } from './BotaoConfirmar';

afterEach(() => {
  vi.useRealTimers();
});

function montar(desabilitado = false, pendente = false) {
  const aoEnviar = vi.fn((e: FormEvent) => e.preventDefault());
  render(
    <form onSubmit={aoEnviar}>
      <BotaoConfirmar rotulo="Enviar ao ML" rotuloConfirmar="Toque de novo para enviar ao ML" desabilitado={desabilitado} pendente={pendente} rotuloPendente="Enviando ao ML…" className="x" />
    </form>,
  );
  return aoEnviar;
}

describe('BotaoConfirmar (ação sem volta pede segundo toque)', () => {
  it('o 1º toque pede confirmação; o 2º envia o formulário uma vez', () => {
    const aoEnviar = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao ML' }));
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para enviar ao ML' }));
    expect(aoEnviar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enviar ao ML' })).toBeTruthy();
  });

  it('depois de 5 segundos sem o 2º toque, volta ao normal', () => {
    vi.useFakeTimers();
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao ML' }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('button', { name: 'Enviar ao ML' })).toBeTruthy();
  });

  it('desabilitado (enviando) não reage', () => {
    const aoEnviar = montar(true);
    const botao = screen.getByRole('button', { name: 'Enviar ao ML' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it('pendente mostra o rótulo de progresso e o anuncia numa região de status', () => {
    montar(true, true);
    expect(screen.getByRole('button', { name: 'Enviando ao ML…' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Enviando ao ML…');
  });

  it('sem pendente a região de status fica vazia', () => {
    montar();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
