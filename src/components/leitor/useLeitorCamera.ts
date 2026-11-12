'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { criarDetector, mensagemErroCamera } from './detector';

export type SituacaoCamera = 'parada' | 'abrindo' | 'lendo';

const INTERVALO_MS = 200;
/** O mesmo código lido de novo dentro deste tempo é ignorado (o pacote ainda está na frente da câmera). */
const PAUSA_MESMO_CODIGO_MS = 3000;

function pararFluxo(fluxo: MediaStream | null | undefined) {
  fluxo?.getTracks().forEach((t) => t.stop());
}

/**
 * Câmera traseira lendo códigos em sequência, um pacote atrás do outro, até a pessoa fechar.
 * Tudo começa num toque (handler), nunca sozinho num efeito: o navegador exige um gesto para abrir a câmera.
 *
 * Ciclo de vida: `tokenRef` numera cada tentativa. Fechar, sair da tela ou abrir de novo invalida a anterior, e uma
 * tentativa velha que termina depois (câmera ainda "abrindo") desliga o que abriu e não faz mais nada.
 */
export function useLeitorCamera(aoLer: (codigo: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pararRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);
  const abrindoRef = useRef(false);
  const aoLerRef = useRef(aoLer);
  const [situacao, setSituacao] = useState<SituacaoCamera>('parada');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  // Ao sair da tela, cancela uma abertura em andamento e desliga a câmera.
  useEffect(() => {
    const sessao = pararRef;
    const token = tokenRef;
    return () => {
      token.current += 1;
      sessao.current?.();
      sessao.current = null;
    };
  }, []);

  const fechar = useCallback(() => {
    tokenRef.current += 1;
    abrindoRef.current = false;
    pararRef.current?.();
    pararRef.current = null;
    setSituacao('parada');
  }, []);

  const abrir = useCallback(async () => {
    if (abrindoRef.current || pararRef.current) return; // já abrindo ou lendo
    setErro(null);
    const video = videoRef.current;
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setErro('A câmera só funciona em conexão segura (HTTPS).');
      return;
    }
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setErro('Este navegador não deixa usar a câmera aqui. Digite o código.');
      return;
    }
    const token = ++tokenRef.current;
    const vigente = () => token === tokenRef.current;
    abrindoRef.current = true;
    setSituacao('abrindo');
    let fluxo: MediaStream | null = null;
    // O fluxo é guardado assim que a câmera abre, para o catch conseguir desligá-la mesmo se o detector falhar.
    const midiaPromessa = navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((m) => (fluxo = m));
    try {
      const [detector, midia] = await Promise.all([criarDetector(), midiaPromessa]);
      if (!vigente()) {
        pararFluxo(midia);
        return;
      }
      video.srcObject = midia;
      await video.play();
      if (!vigente()) {
        pararFluxo(midia);
        video.srcObject = null;
        return;
      }
      let ativa = true;
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      let ultimo = { codigo: '', em: 0 };
      const aoEsconder = () => {
        if (document.hidden) fechar();
      };
      const aoTerminar = () => {
        setErro('A câmera foi interrompida. Toque para abrir de novo.');
        fechar();
      };
      const trilhas = midia.getTracks();
      document.addEventListener('visibilitychange', aoEsconder);
      trilhas.forEach((t) => t.addEventListener('ended', aoTerminar));
      pararRef.current = () => {
        ativa = false;
        clearTimeout(temporizador);
        document.removeEventListener('visibilitychange', aoEsconder);
        trilhas.forEach((t) => t.removeEventListener('ended', aoTerminar));
        pararFluxo(midia);
        video.srcObject = null;
      };
      abrindoRef.current = false;
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
      // Se o detector falhou mas a câmera abriu (ou ainda vai abrir), desliga.
      pararFluxo(fluxo ?? (await midiaPromessa.catch(() => null)));
      video.srcObject = null;
      if (vigente()) {
        abrindoRef.current = false;
        pararRef.current = null;
        setSituacao('parada');
        setErro(mensagemErroCamera(e));
      }
    }
  }, [fechar]);

  return { videoRef, situacao, erro, abrir, fechar };
}
