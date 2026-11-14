'use client';

import { useCallback, useRef } from 'react';
import { LeitorCodigo } from '@/components/conferencia/LeitorCodigo';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoConferirPacote } from './acoes';

type Acao = (anterior: EstadoConferirPacote, dados: FormData) => Promise<EstadoConferirPacote>;

/** Uma mão: a câmera lê a etiqueta e já abre a conferência; o campo aceita digitação ou leitor USB. */
export function FormularioConferirPacote({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  const formularioRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const aoLer = useCallback((codigo: string) => {
    if (!campoRef.current || !formularioRef.current) return;
    campoRef.current.value = codigo;
    formularioRef.current.requestSubmit();
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <ListaErros erros={estado.erros} />
      <LeitorCodigo rotulo="Ler com a câmera" titulo="Leitor da etiqueta do pacote" instrucao="Aponte para a etiqueta de rastreio do pacote." aoLer={aoLer} />
      <form ref={formularioRef} onSubmit={aoEnviar} className="flex flex-col gap-3">
        <label htmlFor="codigo" className={ROTULO}>
          Código de Rastreamento ou código DEV
        </label>
        <input
          ref={campoRef}
          id="codigo"
          name="codigo"
          required
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className={`${CAMPO} h-14 font-mono text-lg`}
        />
        <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
          {pendente ? 'Abrindo…' : 'Abrir conferência'}
        </button>
      </form>
    </div>
  );
}
