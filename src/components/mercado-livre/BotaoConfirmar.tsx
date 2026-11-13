'use client';

import { useEffect, useState } from 'react';

/** Quanto tempo o segundo toque continua valendo. */
const TEMPO_CONFIRMACAO_MS = 5000;

/**
 * Botão de ação sem volta ("Desconectar", "Enviar ao ML"): o 1º toque pede confirmação e o 2º envia o formulário.
 * Sempre type="button": se o tipo virasse "submit" no meio do toque, o 1º toque já enviaria (mesmo cuidado de AcoesUsuario).
 */
export function BotaoConfirmar({
  rotulo,
  rotuloConfirmar,
  desabilitado = false,
  className,
}: {
  rotulo: string;
  rotuloConfirmar: string;
  desabilitado?: boolean;
  className: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (!confirmando) return;
    const espera = setTimeout(() => setConfirmando(false), TEMPO_CONFIRMACAO_MS);
    return () => clearTimeout(espera);
  }, [confirmando]);
  return (
    <button
      type="button"
      disabled={desabilitado}
      className={className}
      onClick={(evento) => {
        if (!confirmando) {
          setConfirmando(true);
          return;
        }
        setConfirmando(false);
        evento.currentTarget.form?.requestSubmit();
      }}
    >
      {confirmando ? rotuloConfirmar : rotulo}
    </button>
  );
}
