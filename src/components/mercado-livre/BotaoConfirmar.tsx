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
  pendente = false,
  rotuloPendente,
  className,
}: {
  rotulo: string;
  rotuloConfirmar: string;
  desabilitado?: boolean;
  /** Envio em andamento: o botão mostra `rotuloPendente` e o leitor de tela anuncia o mesmo texto. */
  pendente?: boolean;
  rotuloPendente?: string;
  className: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (!confirmando) return;
    const espera = setTimeout(() => setConfirmando(false), TEMPO_CONFIRMACAO_MS);
    return () => clearTimeout(espera);
  }, [confirmando]);
  const textoPendente = pendente ? (rotuloPendente ?? '') : '';
  return (
    <>
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
        {textoPendente || (confirmando ? rotuloConfirmar : rotulo)}
      </button>
      <span role="status" className="sr-only">
        {textoPendente}
      </span>
    </>
  );
}
