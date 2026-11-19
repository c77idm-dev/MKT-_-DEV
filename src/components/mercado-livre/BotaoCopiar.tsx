'use client';

import { useState } from 'react';
import { BOTAO_SECUNDARIO } from '../estilos';

/** "Copiar" da mensagem para colar no ML (§4.6). O aviso é anunciado (role=status); sem a área de transferência, explica como copiar. */
export function BotaoCopiar({ texto, rotulo = 'Copiar', rotuloCopiado = 'Copiado.' }: { texto: string; rotulo?: string; rotuloCopiado?: string }) {
  const [aviso, setAviso] = useState('');
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(rotuloCopiado);
    } catch {
      setAviso('Não deu para copiar aqui. Toque e segure na mensagem para copiar.');
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={copiar} className={`${BOTAO_SECUNDARIO} w-full md:w-auto`}>
        {rotulo}
      </button>
      <span role="status" className="text-sm text-texto-2">
        {aviso}
      </span>
    </div>
  );
}
