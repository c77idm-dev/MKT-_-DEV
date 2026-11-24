'use client';

import { useCallback, useEffect, useRef, type FormEvent } from 'react';
import { LeitorCodigo } from '@/components/conferencia/LeitorCodigo';
import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { EscolhaDaDevolucao } from '@/components/venda/EscolhaDaDevolucao';
import { useTravaToqueDuplo } from '@/components/venda/useTravaToqueDuplo';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import type { EstadoConferirPacote } from './acoes';

type Acao = (anterior: EstadoConferirPacote, dados: FormData) => Promise<EstadoConferirPacote>;
type AoEnviar = (evento: FormEvent<HTMLFormElement>) => void;

/** (extra, E27) "Iniciar conferência" de uma devolução da ficha: manda o código DEV dela, depois da trava do toque duplo. */
function IniciarDaFicha({ ficha, aoEnviar, pendente }: { ficha: FichaVenda; aoEnviar: AoEnviar; pendente: boolean }) {
  const cedoDemais = useTravaToqueDuplo();
  return (
    <form
      onSubmit={(evento) => {
        if (cedoDemais()) {
          evento.preventDefault();
          return;
        }
        aoEnviar(evento);
      }}
    >
      <input type="hidden" name="codigo" value={ficha.codigo} />
      <input type="hidden" name="origem" value="ficha" />
      <button type="submit" disabled={pendente} className={`${BOTAO_PRIMARIO} min-h-14 w-full text-lg`}>
        Iniciar conferência<span className="sr-only"> da {ficha.codigo}</span>
      </button>
    </form>
  );
}

/**
 * (extra, E27) Achadas pelo número do pedido do ML: a ficha da venda (uma devolução) ou a lista (mais de uma), e a pessoa
 * toca em "Iniciar conferência" na do pacote que está na bancada. O título recebe o foco (o leitor de tela o lê).
 */
function FichasDoPedido({ pedido, aoEnviar, pendente }: { pedido: NonNullable<EstadoConferirPacote['pedido']>; aoEnviar: AoEnviar; pendente: boolean }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus();
  }, []);
  const quantas = pedido.fichas.length;
  return (
    <section aria-labelledby="titulo-pedido-ml" className={`${CARTAO} flex flex-col gap-3`}>
      <div className="flex flex-col gap-1">
        <h2 ref={titulo} id="titulo-pedido-ml" tabIndex={-1} className="text-base font-bold outline-none">
          {quantas > 1 ? 'Achadas' : 'Achada'} pelo número do pedido do ML <span className="font-normal text-texto-2">(extra)</span>
        </h2>
        <p className="text-sm text-texto-2">
          {quantas > 1
            ? `Este pedido tem ${quantas} devoluções para conferir. Toque em “Iniciar conferência” na do pacote que está na bancada.`
            : 'Confira a venda e toque em “Iniciar conferência”.'}
        </p>
      </div>
      <EscolhaDaDevolucao fichas={pedido.fichas} acao={(ficha) => <IniciarDaFicha ficha={ficha} aoEnviar={aoEnviar} pendente={pendente} />} />
    </section>
  );
}

/**
 * Uma mão: a câmera lê a etiqueta e já abre a conferência; o campo aceita digitação ou leitor USB. (extra, E27) Pelo
 * número do pedido do ML a conferência não abre sozinha: a ficha aparece para a pessoa escolher.
 */
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
      {estado.pedido && <FichasDoPedido key={estado.pedido.lidaEm} pedido={estado.pedido} aoEnviar={aoEnviar} pendente={pendente} />}
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
