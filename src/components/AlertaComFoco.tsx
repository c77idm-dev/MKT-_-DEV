'use client';

import { useEffect, useRef } from 'react';
import { ALERTA_ERRO } from './estilos';

/** Erro que aparece com a página (ex.: período inválido na URL): é anunciado e recebe o foco, como o MensagemSucesso. */
export function AlertaComFoco({ texto }: { texto: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} role="alert" tabIndex={-1} className={`${ALERTA_ERRO} outline-none`}>
      {texto}
    </p>
  );
}
