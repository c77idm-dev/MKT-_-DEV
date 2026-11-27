'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ListaErros } from './ListaErros';
import { ALERTA_ATENCAO, BOTAO_PERIGO, BOTAO_SECUNDARIO } from './estilos';
import { useEnvioFormulario } from './useEnvioFormulario';
import { useTravaToqueDuplo } from './venda/useTravaToqueDuplo';

type Estado = { erros: string[] };

type Props = {
  acao: (anterior: Estado, dados: FormData) => Promise<Estado>;
  /** Base dos ids (título e caixa de erros): único na página. */
  id: string;
  titulo: string;
  /** O que a correção faz, à vista antes do 1º toque. */
  descricao: string;
  /** O botão vermelho do 1º passo, que diz o que faz. */
  botao: string;
  /** A pergunta da confirmação: o que será descartado. */
  pergunta: string;
  confirmar: string;
  enviando: string;
  /** Campos escondidos que vão junto (ex.: o id da unidade). */
  children?: ReactNode;
};

/**
 * O 2º passo: montado a cada vez que a pergunta abre, para a trava do toque duplo (0,7 s, a mesma da E24) recomeçar. O
 * "Sim" tocado antes disso não envia: o 2º toque de um toque duplo no botão do 1º passo cairia nele.
 */
function Pergunta({ texto, confirmar, enviando, pendente, voltar }: { texto: string; confirmar: string; enviando: string; pendente: boolean; voltar: () => void }) {
  const cedoDemais = useTravaToqueDuplo();
  const pergunta = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    pergunta.current?.focus();
  }, []);
  function aoConfirmar(evento: MouseEvent<HTMLButtonElement>) {
    if (cedoDemais()) evento.preventDefault();
  }
  return (
    <div className={`${ALERTA_ATENCAO} flex w-full flex-col gap-2`}>
      <p ref={pergunta} tabIndex={-1} className="text-[15px] outline-none">
        {texto}
      </p>
      <button type="submit" onClick={aoConfirmar} disabled={pendente} className={BOTAO_PERIGO}>
        {pendente ? enviando : confirmar}
      </button>
      <button type="button" onClick={voltar} disabled={pendente} className={BOTAO_SECUNDARIO}>
        Voltar
      </button>
    </div>
  );
}

/**
 * (extra, E29) Correção destrutiva do Gestor (apagar, desfazer a chegada) com o passo de confirmação da E24: botão
 * vermelho que diz o que faz, a pergunta com o que será descartado e a trava do toque duplo (`useTravaToqueDuplo`). A
 * recusa do servidor aparece num alerta.
 */
export function FormularioConfirmado({ acao, id, titulo, descricao, botao, pergunta, confirmar, enviando, children }: Props) {
  const idErros = `erros-${id}`;
  const idTitulo = `titulo-${id}`;
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, idErros);
  const [confirmando, setConfirmando] = useState(false);
  const botaoInicial = useRef<HTMLButtonElement>(null);
  const voltou = useRef(false);

  useEffect(() => {
    if (!confirmando && voltou.current) {
      voltou.current = false;
      botaoInicial.current?.focus();
    }
  }, [confirmando]);

  function voltar() {
    voltou.current = true;
    setConfirmando(false);
  }

  return (
    <form onSubmit={aoEnviar} aria-labelledby={idTitulo} className="flex flex-col gap-2">
      {children}
      <h3 id={idTitulo} className="text-base font-bold">
        {titulo}
      </h3>
      <p className="text-sm text-texto-2">{descricao}</p>
      <ListaErros erros={estado.erros} id={idErros} />
      {confirmando ? (
        <Pergunta texto={pergunta} confirmar={confirmar} enviando={enviando} pendente={pendente} voltar={voltar} />
      ) : (
        <button ref={botaoInicial} type="button" onClick={() => setConfirmando(true)} className={BOTAO_PERIGO}>
          {botao}
        </button>
      )}
    </form>
  );
}
