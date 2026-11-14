'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PERIGO, BOTAO_PRIMARIO } from '@/components/estilos';
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

/** Spec §11: o Gestor libera a trava (por exemplo, o celular de quem conferia quebrou). O que foi feito fica guardado. */
export function FormularioLiberarTrava({ acao, conferente }: { acao: Acao; conferente: string }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-liberar-trava');
  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-2">
      <p className="text-sm text-texto-2">Liberar a trava tira a conferência de {conferente}. O que já foi feito fica guardado.</p>
      <ListaErros erros={estado.erros} id="erros-liberar-trava" />
      <button type="submit" disabled={pendente} className={BOTAO_PERIGO}>
        {pendente ? 'Liberando…' : 'Liberar trava'}
      </button>
    </form>
  );
}
