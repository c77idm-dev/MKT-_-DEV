'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { entrar, type EstadoLogin } from './acoes';
import { guardarEmailLembrado, lerEmailLembrado } from './lembrar';

const ESTADO_INICIAL: EstadoLogin = { erro: null };

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);
  const [verSenha, setVerSenha] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const lembrarRef = useRef<HTMLInputElement>(null);

  // Lembrar de mim (extra): o e-mail guardado só é lido depois da montagem (nada de localStorage na renderização).
  useEffect(() => {
    const lembrado = lerEmailLembrado();
    if (lembrado && emailRef.current && senhaRef.current) {
      emailRef.current.value = lembrado;
      senhaRef.current.focus();
    }
  }, []);

  // O React 19 limpa o formulário depois da `action`. Com senha errada, devolve o e-mail e a caixa como estavam
  // e põe o foco na senha, para a pessoa só digitar de novo (extra).
  const enviado = useRef<{ email: string; lembrar: boolean } | null>(null);
  useEffect(() => {
    const ultimo = enviado.current;
    if (!estado.erro || !ultimo || !emailRef.current || !senhaRef.current || !lembrarRef.current) return;
    emailRef.current.value = ultimo.email;
    lembrarRef.current.checked = ultimo.lembrar;
    senhaRef.current.focus();
  }, [estado]);

  function aoEnviar() {
    // Sem preventDefault: a `action` continua rodando depois daqui.
    const email = emailRef.current?.value ?? '';
    const lembrar = lembrarRef.current?.checked ?? false;
    enviado.current = { email, lembrar };
    guardarEmailLembrado(email, lembrar);
  }

  return (
    <form action={acao} onSubmit={aoEnviar} className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-semibold text-texto-2">
          E-mail
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          enterKeyHint="next"
          required
          className="h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 text-[15px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="text-[13px] font-semibold text-texto-2">
          Senha
        </label>
        <div className="relative">
          <input
            ref={senhaRef}
            id="senha"
            name="senha"
            type={verSenha ? 'text' : 'password'}
            autoComplete="current-password"
            enterKeyHint="go"
            required
            className="h-11 w-full rounded-lg border border-borda-campo bg-superficie pr-16 pl-3 text-[15px]"
          />
          {/* Mostrar a senha (extra). O nome acessível ("Ver"/"Ocultar") não contém "senha": o e2e usa getByLabel('Senha'). */}
          <button
            type="button"
            aria-pressed={verSenha}
            aria-controls="senha"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute top-0 right-0 h-11 min-w-11 rounded-r-lg px-3 text-[13px] font-semibold text-destaque hover:text-destaque-escuro"
          >
            {verSenha ? 'Ocultar' : 'Ver'}
          </button>
        </div>
      </div>
      {/* Lembrar de mim (extra): guarda só o e-mail neste aparelho, nunca a senha. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 self-start text-sm text-texto-2">
        <input ref={lembrarRef} type="checkbox" name="lembrar" defaultChecked className="size-5 accent-destaque" />
        Lembrar de mim neste aparelho
      </label>
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro">
          {estado.erro}
        </p>
      )}
      {/* No celular o botão desce para o pé da folha, ao alcance do polegar. */}
      <div aria-hidden className="flex-1 md:hidden" />
      <button
        type="submit"
        disabled={pendente}
        className="h-12 w-full rounded-full bg-destaque text-[15px] font-semibold text-white hover:bg-destaque-escuro disabled:opacity-60"
      >
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
