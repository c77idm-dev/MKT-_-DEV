'use client';

import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from 'react';
import { BOTAO_SECUNDARIO } from '@/components/estilos';

/** Quantas atualizações de coluna estão em andamento (a coluna mudou e a prévia ainda não voltou). */
const AtualizandoContexto = createContext(false);
const IniciarContexto = createContext<(tarefa: () => Promise<void>) => Promise<void>>(async (tarefa) => tarefa());

/** Compartilha entre o formulário de colunas e o de confirmação o estado "prévia desatualizada". */
export function ImportacaoInterativa({ children }: { children: ReactNode }) {
  const [emAndamento, setEmAndamento] = useState(0);
  const rodar = useCallback(async (tarefa: () => Promise<void>) => {
    setEmAndamento((n) => n + 1);
    try {
      await tarefa();
    } finally {
      setEmAndamento((n) => n - 1);
    }
  }, []);
  return (
    <IniciarContexto.Provider value={rodar}>
      <AtualizandoContexto.Provider value={emAndamento > 0}>{children}</AtualizandoContexto.Provider>
    </IniciarContexto.Provider>
  );
}

export function useAtualizandoPrevia() {
  return useContext(AtualizandoContexto);
}

/**
 * Formulário das colunas. Trocar qualquer coluna envia na hora (a prévia atualiza sem outro toque) e
 * enquanto isso a confirmação fica desabilitada: ela nunca importa uma coluna diferente da que a tela mostra.
 * O botão "Atualizar prévia" continua como alternativa.
 */
export function FormularioColunas({ acao, children }: { acao: (dados: FormData) => Promise<void>; children: ReactNode }) {
  const rodar = useContext(IniciarContexto);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    void rodar(() => acao(dados));
  }
  return (
    <form
      onSubmit={aoEnviar}
      onChange={(evento) => {
        // Marca como "atualizando" no mesmo instante da troca, antes de a resposta voltar.
        evento.currentTarget.requestSubmit();
      }}
      className="flex flex-col gap-3"
    >
      {children}
      <button type="submit" className={BOTAO_SECUNDARIO}>
        Atualizar prévia
      </button>
    </form>
  );
}
