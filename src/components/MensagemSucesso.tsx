'use client';

import { useEffect, useRef } from 'react';
import { ALERTA_OK } from './estilos';

/** Confirmação depois de uma ação cujo formulário some: recebe o foco (o foco não cai no <body>) e é anunciada. */
export function MensagemSucesso({ texto }: { texto: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} role="status" tabIndex={-1} className={`${ALERTA_OK} outline-none`}>
      {texto}
    </p>
  );
}
