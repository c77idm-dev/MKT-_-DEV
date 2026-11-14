'use client';

import { useState } from 'react';
import { ListaErros } from '@/components/ListaErros';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoSecaoConferencia } from './acoes';

type Acao = (anterior: EstadoSecaoConferencia, dados: FormData) => Promise<EstadoSecaoConferencia>;

export function FormularioIniciarConferencia({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-iniciar-conferencia');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <ListaErros erros={estado.erros} id="erros-iniciar-conferencia" />
      <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
        {pendente ? 'Abrindo…' : 'Iniciar conferência'}
      </button>
    </form>
  );
}

/**
 * Spec §11: o Gestor libera a trava (por exemplo, o celular de quem conferia quebrou). O que foi feito fica guardado.
 * Pede confirmação (como o Desistir): um toque errado no celular tiraria a conferência do colega.
 */
export function FormularioLiberarTrava({ acao, conferente }: { acao: Acao; conferente: string }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-liberar-trava');
  const [confirmando, setConfirmando] = useState(false);
  const aviso = `Liberar a trava tira a conferência de ${conferente}. O que já foi feito fica guardado.`;
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <ListaErros erros={estado.erros} id="erros-liberar-trava" />
      {confirmando ? (
        <div className={`${ALERTA_ATENCAO} flex flex-col gap-2`}>
          <p className="text-[15px]">{aviso}</p>
          <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
            {pendente ? 'Liberando…' : 'Confirmar liberação'}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} disabled={pendente} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-texto-2">{aviso}</p>
          <button type="button" onClick={() => setConfirmando(true)} className={BOTAO_PERIGO}>
            Liberar trava
          </button>
        </>
      )}
    </form>
  );
}
