'use client';

import { useActionState } from 'react';
import { entrar, type EstadoLogin } from './acoes';

const ESTADO_INICIAL: EstadoLogin = { erro: null };

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);
  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-semibold text-texto-2">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 rounded-lg border border-borda-forte bg-superficie px-3 text-[15px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="text-[13px] font-semibold text-texto-2">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-lg border border-borda-forte bg-superficie px-3 text-[15px]"
        />
      </div>
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="h-12 rounded-full bg-destaque text-[15px] font-semibold text-white hover:bg-destaque-escuro disabled:opacity-60"
      >
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
