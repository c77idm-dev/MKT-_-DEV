'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { criarDetector, mensagemErroCamera } from './detector';

export type SituacaoCamera = 'parada' | 'abrindo' | 'lendo';

const INTERVALO_MS = 200;
/** O mesmo código lido de novo dentro deste tempo é ignorado (o pacote ainda está na frente da câmera). */
const PAUSA_MESMO_CODIGO_MS = 3000;

/**
 * Câmera traseira lendo códigos em sequência, um pacote atrás do outro, até a pessoa fechar.
 * Tudo começa num toque (handler), nunca sozinho num efeito: o navegador exige um gesto para abrir a câmera.
 */
export function useLeitorCamera(aoLer: (codigo: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pararRef = useRef<(() => void) | null>(null);
  const aoLerRef = useRef(aoLer);
  const [situacao, setSituacao] = useState<SituacaoCamera>('parada');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  // Ao sair da tela, desliga a câmera.
  useEffect(() => {
    const sessao = pararRef;
    return () => sessao.current?.();
  }, []);

  const fechar = useCallback(() => {
    pararRef.current?.();
    pararRef.current = null;
    setSituacao('parada');
  }, []);

  const abrir = useCallback(async () => {
    setErro(null);
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setErro('Este navegador não deixa usar a câmera aqui. Digite o código.');
      return;
    }
    setSituacao('abrindo');
    let fluxo: MediaStream | null = null;
    try {
      const [detector, midia] = await Promise.all([
        criarDetector(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
      ]);
      fluxo = midia;
      video.srcObject = midia;
      await video.play();
      let ativa = true;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      let ultimo = { codigo: '', em: 0 };
      pararRef.current = () => {
        ativa = false;
        clearTimeout(temporizador);
        midia.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      };
      setSituacao('lendo');
      const ler = async () => {
        if (!ativa) return;
        const codigo = video.readyState >= 2 ? await detector.detectar(video).catch(() => null) : null;
        if (!ativa) return;
        const agora = Date.now();
        if (codigo && (codigo !== ultimo.codigo || agora - ultimo.em > PAUSA_MESMO_CODIGO_MS)) {
          ultimo = { codigo, em: agora };
          navigator.vibrate?.(80); // (extra) confirma a leitura no Android; o iPhone não vibra
          aoLerRef.current(codigo);
        }
        temporizador = setTimeout(ler, INTERVALO_MS);
      };
      void ler();
    } catch (e) {
      fluxo?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      pararRef.current = null;
      setSituacao('parada');
      setErro(mensagemErroCamera(e));
    }
  }, []);

  return { videoRef, situacao, erro, abrir, fechar };
}
