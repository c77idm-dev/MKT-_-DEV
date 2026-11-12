'use client';

import { startTransition, useActionState, useEffect, type FormEvent } from 'react';

import { ID_ERROS_FORMULARIO } from './ListaErros';
export { ID_ERROS_FORMULARIO };

/**
 * Envia o formulário para uma Server Action sem limpar os campos. O `<form action>` do React 19 limpa
 * o formulário depois de cada envio, e o usuário perderia o que digitou quando a ação devolve um erro.
 * Quando chegam erros novos, leva o foco e a rolagem até a lista de erros (no celular o botão Salvar
 * fica preso embaixo e a mensagem, no alto, poderia nunca ser vista).
 */
export function useEnvioFormulario<E extends { erros: string[] }>(
  acao: (anterior: E, dados: FormData) => Promise<E>,
  inicial: E,
  /** Id da caixa de erros (ver ListaErros); o padrão serve quando a página tem um só formulário. */
  idErros: string = ID_ERROS_FORMULARIO,
) {
  // O cast é seguro: o TypeScript só exige `Awaited<E>` porque E é genérico; nossos estados são objetos
  // simples (sem `then`), então Awaited<E> é o próprio E e a função em tempo de execução é a mesma.
  const [estado, despachar, pendente] = useActionState<E, FormData>(
    acao as (anterior: Awaited<E>, dados: FormData) => Promise<E>,
    inicial as Awaited<E>,
  );

  // Cada resposta da ação é um objeto novo, então o efeito roda a cada nova lista não vazia.
  useEffect(() => {
    if (estado.erros.length === 0) return;
    const caixa = document.getElementById(idErros);
    caixa?.focus();
    caixa?.scrollIntoView({ block: 'center' });
  }, [estado, idErros]);

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  }
  return [estado, aoEnviar, pendente] as const;
}
