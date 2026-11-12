// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const criarDetectorMock = vi.fn();
vi.mock('./detector', async (original) => ({ ...(await original<typeof import('./detector')>()), criarDetector: () => criarDetectorMock() }));

import { useLeitorCamera } from './useLeitorCamera';

type TrilhaFalsa = EventTarget & { stop: ReturnType<typeof vi.fn> };

function criarFluxoFalso() {
  const trilha = Object.assign(new EventTarget(), { stop: vi.fn() }) as TrilhaFalsa;
  const fluxo = { getTracks: () => [trilha] } as unknown as MediaStream;
  return { fluxo, trilha };
}

function prepararHook() {
  const hook = renderHook(() => useLeitorCamera(vi.fn()));
  const video = document.createElement('video');
  video.play = vi.fn().mockResolvedValue(undefined);
  (hook.result.current.videoRef as { current: HTMLVideoElement | null }).current = video;
  return { ...hook, video };
}

function instalarGum(gum: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
}

beforeEach(() => {
  criarDetectorMock.mockReset();
  criarDetectorMock.mockResolvedValue({ origem: 'zxing', detectar: vi.fn().mockResolvedValue(null) });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('useLeitorCamera', () => {
  it('desliga a câmera quando o detector falha mas a câmera abriu', async () => {
    const { fluxo, trilha } = criarFluxoFalso();
    instalarGum(() => Promise.resolve(fluxo));
    criarDetectorMock.mockRejectedValue(new Error('wasm'));
    const { result } = prepararHook();
    await act(() => result.current.abrir());
    await waitFor(() => expect(trilha.stop).toHaveBeenCalled());
    expect(result.current.situacao).toBe('parada');
    expect(result.current.erro).toBe('Não foi possível abrir a câmera. Digite o código.');
  });

  it('fechar durante "abrindo" cancela: desliga a câmera e não começa a ler', async () => {
    const { fluxo, trilha } = criarFluxoFalso();
    let liberar!: (m: MediaStream) => void;
    instalarGum(() => new Promise((r) => (liberar = r)));
    const { result, video } = prepararHook();
    let aberta!: Promise<void>;
    act(() => {
      aberta = result.current.abrir();
    });
    expect(result.current.situacao).toBe('abrindo');
    act(() => result.current.fechar());
    await act(async () => {
      liberar(fluxo);
      await aberta;
    });
    expect(trilha.stop).toHaveBeenCalled();
    expect(result.current.situacao).toBe('parada');
    expect(video.play).not.toHaveBeenCalled();
  });

  it('sair da tela durante "abrindo" também desliga a câmera', async () => {
    const { fluxo, trilha } = criarFluxoFalso();
    let liberar!: (m: MediaStream) => void;
    instalarGum(() => new Promise((r) => (liberar = r)));
    const { result, unmount } = prepararHook();
    let aberta!: Promise<void>;
    act(() => {
      aberta = result.current.abrir();
    });
    unmount();
    await act(async () => {
      liberar(fluxo);
      await aberta;
    });
    expect(trilha.stop).toHaveBeenCalled();
  });

  it('ignora um segundo abrir enquanto o primeiro está em andamento', async () => {
    const { fluxo } = criarFluxoFalso();
    const gum = vi.fn(() => Promise.resolve(fluxo));
    instalarGum(gum);
    const { result } = prepararHook();
    await act(async () => {
      await Promise.all([result.current.abrir(), result.current.abrir()]);
    });
    expect(gum).toHaveBeenCalledTimes(1);
  });

  it('fecha a câmera quando a aba vai para segundo plano', async () => {
    const { fluxo, trilha } = criarFluxoFalso();
    instalarGum(() => Promise.resolve(fluxo));
    const { result } = prepararHook();
    await act(() => result.current.abrir());
    expect(result.current.situacao).toBe('lendo');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    expect(trilha.stop).toHaveBeenCalled();
    expect(result.current.situacao).toBe('parada');
  });

  it('fecha e avisa quando o sistema interrompe a câmera (trilha "ended")', async () => {
    const { fluxo, trilha } = criarFluxoFalso();
    instalarGum(() => Promise.resolve(fluxo));
    const { result } = prepararHook();
    await act(() => result.current.abrir());
    act(() => {
      trilha.dispatchEvent(new Event('ended'));
    });
    expect(result.current.situacao).toBe('parada');
    expect(result.current.erro).toBe('A câmera foi interrompida. Toque para abrir de novo.');
  });

  it('remove os ouvintes ao fechar (visibilitychange depois não faz nada)', async () => {
    const { fluxo, trilha } = criarFluxoFalso();
    instalarGum(() => Promise.resolve(fluxo));
    const { result } = prepararHook();
    await act(() => result.current.abrir());
    act(() => result.current.fechar());
    trilha.stop.mockClear();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    trilha.dispatchEvent(new Event('ended'));
    expect(trilha.stop).not.toHaveBeenCalled();
    expect(result.current.erro).toBeNull();
  });

  it('explica quando a página não está em HTTPS', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const gum = vi.fn();
    instalarGum(gum);
    const { result } = prepararHook();
    await act(() => result.current.abrir());
    expect(gum).not.toHaveBeenCalled();
    expect(result.current.erro).toBe('A câmera só funciona em conexão segura (HTTPS).');
  });
});
