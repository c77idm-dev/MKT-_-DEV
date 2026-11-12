'use client';

import { startTransition, useActionState, type FormEvent } from 'react';

/**
 * Envia o formulário para uma Server Action sem limpar os campos. O `<form action>` do React 19 limpa
 * o formulário depois de cada envio, e o usuário perderia o que digitou quando a ação devolve um erro.
 */
export function useEnvioFormulario<E>(acao: (anterior: E, dados: FormData) => Promise<E>, inicial: E) {
  const [estado, despachar, pendente] = useActionState<E, FormData>(acao as (anterior: Awaited<E>, dados: FormData) => Promise<E>, inicial as Awaited<E>);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  }
  return [estado, aoEnviar, pendente] as const;
}
