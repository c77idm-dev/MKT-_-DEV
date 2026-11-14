'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ALERTA_ERRO } from '@/components/estilos';
import { useLeitorCamera } from '@/components/leitor/useLeitorCamera';

/**
 * Lê um código pela câmera traseira, em tela cheia, e fecha na primeira leitura (spec §6.3: leitura do código de
 * barras). Mesmo leitor do Recebimento (BarcodeDetector ou ZXing). O foco vai para "Fechar câmera" e volta ao botão.
 */
export function LeitorCodigo({
  rotulo,
  titulo,
  aoLer,
  instrucao = 'Aponte para o código de barras da unidade.',
}: {
  rotulo: string;
  titulo: string;
  aoLer: (codigo: string) => void;
  instrucao?: string;
}) {
  const aoLerRef = useRef(aoLer);
  const fecharRef = useRef<() => void>(() => {});
  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);
  const lido = useCallback((codigo: string) => {
    fecharRef.current();
    aoLerRef.current(codigo);
  }, []);
  const { videoRef, situacao, erro, abrir, fechar } = useLeitorCamera(lido);
  useEffect(() => {
    fecharRef.current = fechar;
  }, [fechar]);
  const aberta = situacao !== 'parada';
  const botaoAbrirRef = useRef<HTMLButtonElement>(null);
  const botaoFecharRef = useRef<HTMLButtonElement>(null);
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    (aberta ? botaoFecharRef : botaoAbrirRef).current?.focus();
  }, [aberta]);

  return (
    <>
      <button
        ref={botaoAbrirRef}
        type="button"
        onClick={() => void abrir()}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-texto px-4 text-base font-semibold text-white"
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 12h10" />
        </svg>
        {rotulo}
      </button>
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      <div
        role={aberta ? 'dialog' : undefined}
        aria-modal={aberta ? true : undefined}
        aria-label={aberta ? titulo : undefined}
        className={aberta ? 'fixed inset-0 z-50 flex h-dvh flex-col bg-black' : 'hidden'}
      >
        <div className="relative min-h-0 flex-1">
          <video ref={videoRef} playsInline muted aria-label="Imagem da câmera" className="h-full w-full object-cover" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/80" />
          {situacao === 'abrindo' && <p className="absolute inset-x-0 top-6 text-center text-sm font-semibold text-white">Abrindo a câmera…</p>}
        </div>
        <div className="flex flex-col gap-3 bg-superficie px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-sm text-texto-2">{instrucao}</p>
          <button ref={botaoFecharRef} type="button" onClick={fechar} className="min-h-14 w-full rounded-2xl border border-borda-campo bg-superficie text-lg font-semibold">
            Fechar câmera
          </button>
        </div>
      </div>
    </>
  );
}
