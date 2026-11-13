'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_SECUNDARIO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { AMBIENTES_NFE, type AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ROTULO_AMBIENTE } from '@/modules/fiscal/dominio';
import type { EstadoFormulario } from './acoes';

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; atual: AmbienteNfe };

/** Spec §8.1: começa em homologação; a passagem para produção é do Gestor, depois da validação do contador. */
export function FormularioAmbiente({ acao, atual }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-ambiente');
  return (
    <form onSubmit={aoEnviar} aria-label="Trocar o ambiente da NF-e" className="flex flex-col gap-3">
      <fieldset className="flex flex-col">
        <legend className={ROTULO}>Ambiente</legend>
        {AMBIENTES_NFE.map((ambiente) => (
          <label key={ambiente} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="ambiente" value={ambiente} defaultChecked={ambiente === atual} className="size-5" />
            {ROTULO_AMBIENTE[ambiente]}
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-start gap-3 py-2 text-[15px]">
        <input type="checkbox" name="confirmacao" value="sim" className="mt-0.5 size-5 flex-none" />O contador validou as regras fiscais e as notas
        emitidas em homologação
      </label>
      <p className="text-sm text-texto-2">
        Em homologação a NF não tem valor fiscal, mas a devolução fica Concluída do mesmo jeito: use devoluções de teste.
      </p>
      <ListaErros erros={estado.erros} id="erros-ambiente" />
      <button type="submit" disabled={pendente} className={BOTAO_SECUNDARIO}>
        {pendente ? 'Salvando…' : 'Salvar ambiente'}
      </button>
    </form>
  );
}
