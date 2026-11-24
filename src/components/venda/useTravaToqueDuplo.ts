'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Quanto tempo o botão fica na tela antes de valer: o mesmo 0,7 s da confirmação da E24 (TRAVA_CONFIRMACAO_MS, em
 * fluxo/devolucoes/[codigo]/AcoesGestor.tsx).
 */
export const TRAVA_TOQUE_DUPLO_MS = 700;

/**
 * (extra, E27) Trava do toque duplo dos botões da ficha da venda ("Dar chegada", "Iniciar conferência"). A ficha aparece
 * depois do toque em outro botão ("Registrar chegada", "Abrir conferência", "Procurar") e empurra a tela: o 2º toque de
 * um toque duplo poderia cair no botão novo e dar a chegada sem a pessoa ter visto qual devolução era. Devolve
 * `cedoDemais()`: true enquanto o botão não ficou 0,7 s na tela (e antes da hidratação); o formulário cancela o envio.
 * Para a trava recomeçar a cada leitura, a tela remonta o bloco (key).
 */
export function useTravaToqueDuplo(): () => boolean {
  const montadoEm = useRef<number | null>(null);
  useEffect(() => {
    montadoEm.current = performance.now();
  }, []);
  return useCallback(() => montadoEm.current === null || performance.now() - montadoEm.current < TRAVA_TOQUE_DUPLO_MS, []);
}
