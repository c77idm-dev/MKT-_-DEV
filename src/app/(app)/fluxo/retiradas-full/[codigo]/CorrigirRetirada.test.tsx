// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVA_TOQUE_DUPLO_MS } from '@/components/venda/useTravaToqueDuplo';
import type { Perfil } from '@/modules/auth/perfis';
import type { SituacaoRetirada } from '@/modules/retiradas/dominio';
import type { EstadoCorrigirRetirada } from './acoes';
import { CorrigirRetirada } from './CorrigirRetirada';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

function montar(situacao: SituacaoRetirada, perfil: Perfil = 'GESTOR') {
  const acoes = {
    reabrir: vi.fn(async (): Promise<EstadoCorrigirRetirada> => ({ erros: [] })),
    apagar: vi.fn(async (): Promise<EstadoCorrigirRetirada> => ({ erros: [] })),
  };
  const tela = render(<CorrigirRetirada codigo="RF-000007" situacao={situacao} perfil={perfil} acoes={acoes} />);
  return { acoes, ...tela };
}

describe('CorrigirRetirada: "Corrigir (Gestor) (extra)" na Retirada do Full (E29)', () => {
  it('só o Gestor vê a seção, recolhida', () => {
    for (const perfil of ['OPERADOR', 'FISCAL'] as const) {
      const { container, unmount } = montar('CONFERIDA', perfil);
      expect(container.innerHTML).toBe('');
      unmount();
    }
    const { container } = montar('CONFERIDA');
    const bloco = container.querySelector('details');
    expect(bloco?.open).toBe(false);
    expect(bloco?.querySelector('summary')?.textContent).toBe('Corrigir (Gestor) (extra)');
  });

  it('Reabrir só na Conferida; Apagar nas duas', () => {
    const { unmount } = montar('CONFERIDA');
    expect(screen.getByRole('button', { name: 'Reabrir a retirada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar retirada' })).toBeTruthy();
    unmount();
    montar('ABERTA');
    expect(screen.queryByRole('button', { name: 'Reabrir a retirada' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Apagar retirada' })).toBeTruthy();
  });

  it('reabrir: um toque', async () => {
    const { acoes } = montar('CONFERIDA');
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir a retirada' }));
    await vi.waitFor(() => expect(acoes.reabrir).toHaveBeenCalledTimes(1));
  });

  it('apagar pede a confirmação, diz que as devoluções da etiqueta amarela não mudam, e vale o toque duplo', async () => {
    const { acoes } = montar('ABERTA');
    expect(screen.getByText(/As devoluções que chegaram pela etiqueta amarela nesta retirada não mudam/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar retirada' }));
    expect(screen.getByText('Tem certeza? A RF-000007 sai da lista de Retiradas do Full e da planilha Volta ao armazém e vai para Apagadas.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar retirada' }));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acoes.apagar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar retirada' }));
    await vi.waitFor(() => expect(acoes.apagar).toHaveBeenCalledTimes(1));
  });
});
