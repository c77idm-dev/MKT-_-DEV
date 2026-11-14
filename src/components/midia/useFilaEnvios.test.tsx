// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const processar = vi.fn(async () => {});
vi.mock('@/modules/midia/acoes', () => ({ registrarEnvioAcao: vi.fn() }));
vi.mock('./armazemIndexedDb', () => ({ armazemIndexedDb: () => ({}) }));
vi.mock('./transporteTus', () => ({ criarTransporteTus: () => vi.fn() }));
vi.mock('./filaEnvios', () => ({
  FilaEnvios: class {
    processar = processar;
    aoMudar = () => () => {};
    aoConcluir = () => () => {};
    listar = async () => [];
  },
}));

import { useManterFilaAtiva } from './useFilaEnvios';

function Tela() {
  useManterFilaAtiva();
  return null;
}

describe('useManterFilaAtiva (a fila continua mesmo sem a tela das fotos)', () => {
  afterEach(() => {
    vi.useRealTimers();
    processar.mockClear();
  });

  it('processa a cada 2 s, quando a rede volta e quando o app volta ao primeiro plano; para ao desmontar', () => {
    vi.useFakeTimers();
    const { unmount } = render(<Tela />);
    processar.mockClear();
    vi.advanceTimersByTime(4000);
    expect(processar).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('online'));
    expect(processar).toHaveBeenLastCalledWith(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(processar).toHaveBeenCalledTimes(4);
    unmount();
    processar.mockClear();
    vi.advanceTimersByTime(4000);
    window.dispatchEvent(new Event('online'));
    expect(processar).not.toHaveBeenCalled();
  });
});
