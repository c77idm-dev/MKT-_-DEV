'use client';

import { useActionState, useCallback, useEffect, useRef } from 'react';
import { LeitorCodigo } from '@/components/conferencia/LeitorCodigo';
import { ALERTA_ERRO, BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { criarRetiradaAcao, type EstadoNovaRetirada } from '../acoes';

const INICIAL: EstadoNovaRetirada = { erro: null };

/** Atalho "Retirada do Full": pede o código da etiqueta, pela câmera ou digitado (ou pelo leitor USB, que digita e manda Enter). */
export function FormularioNovaRetirada() {
  const [estado, acao, pendente] = useActionState(criarRetiradaAcao, INICIAL);
  const formularioRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const erroRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (estado.erro) erroRef.current?.focus();
  }, [estado]);
  const aoLer = useCallback((codigo: string) => {
    if (!campoRef.current || !formularioRef.current) return;
    campoRef.current.value = codigo;
    formularioRef.current.requestSubmit();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {estado.erro && (
        <p ref={erroRef} tabIndex={-1} role="alert" className={ALERTA_ERRO}>
          {estado.erro}
        </p>
      )}
      <LeitorCodigo
        rotulo="Ler etiqueta com a câmera"
        titulo="Leitor da etiqueta"
        instrucao="Aponte para o código de barras da etiqueta."
        aoLer={aoLer}
      />
      <form ref={formularioRef} action={acao} className="flex flex-col gap-3">
        <label htmlFor="codigoEtiqueta" className={ROTULO}>
          Código da etiqueta
        </label>
        <input
          ref={campoRef}
          id="codigoEtiqueta"
          name="codigoEtiqueta"
          required
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className={`${CAMPO} h-14 font-mono text-lg`}
        />
        <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
          {pendente ? 'Abrindo…' : 'Abrir retirada'}
        </button>
      </form>
    </div>
  );
}
