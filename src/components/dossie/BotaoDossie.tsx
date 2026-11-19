'use client';

import { useEffect, useRef, useState } from 'react';
import { BOTAO_SECUNDARIO } from '@/components/estilos';
import { caminhoDossie, nomeArquivoDossie } from '@/modules/dossie/dominio';

/** Tempo do aviso "Gerando…" (o PDF leva alguns segundos na VPS); nesse tempo um 2º toque não gera outro. */
const AVISO_MS = 10_000;

/**
 * Dossiê de provas (PDF) (extra). Um link de download comum, que funciona no Android e no iPhone; o servidor responde
 * com o PDF como anexo. O aviso em role=status mostra que o pedido saiu e segura toques repetidos por alguns segundos.
 */
export function BotaoDossie({ codigo }: { codigo: string }) {
  const [gerando, setGerando] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );
  const idDica = `dica-dossie-${codigo}`;
  return (
    <div className="flex flex-col gap-1">
      <a
        href={caminhoDossie(codigo)}
        download={nomeArquivoDossie(codigo)}
        aria-describedby={idDica}
        aria-disabled={gerando || undefined}
        onClick={(evento) => {
          if (gerando) {
            evento.preventDefault();
            return;
          }
          setGerando(true);
          relogio.current = setTimeout(() => setGerando(false), AVISO_MS);
        }}
        className={`${BOTAO_SECUNDARIO} w-full text-center md:w-auto md:self-start ${gerando ? 'cursor-wait' : ''}`}
      >
        Baixar dossiê de provas (PDF)
      </a>
      <p id={idDica} className="text-xs text-texto-2">
        (extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.
      </p>
      <p role="status" className="text-xs font-semibold text-texto-2">
        {gerando ? 'Gerando o PDF… o download começa em instantes.' : ''}
      </p>
    </div>
  );
}
