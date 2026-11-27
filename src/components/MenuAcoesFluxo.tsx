'use client';

import Link from 'next/link';
import { useId, useRef, type ReactNode } from 'react';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './estilos';

export type IconeAcao = 'pacote' | 'mais' | 'caminhao' | 'planilha' | 'lixeira';

/** Uma linha do menu: quando usar (linha pequena), o nome da ação (negrito) e o destino. */
export type AcaoFluxo = { href: string; quando: string; rotulo: string; icone: IconeAcao; destaque?: boolean };

/** Traços dos ícones (viewBox 24×24), no estilo dos da barra de abas. */
const ICONES: Record<IconeAcao, ReactNode> = {
  pacote: (
    <>
      <path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12M7.5 4.5l9 5.2" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  caminhao: (
    <>
      <path d="M14 18V5H2v13h3M9 18h6M19 18h3v-5l-3-5h-5" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  planilha: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 10v10" />
    </>
  ),
  // (extra, E29) Apagadas.
  lixeira: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
};

function Icone({ children, tamanho }: { children: ReactNode; tamanho: number }) {
  return (
    <svg
      aria-hidden="true"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/**
 * "O que você quer fazer?" (opção C, decisão do usuário em 19/11/2026): um botão só no topo do Fluxo abre o menu
 * com as ações que o perfil pode usar (a lista vem do servidor). Modal nativo (`showModal`): prende o foco, fecha
 * com Esc e devolve o foco ao botão. No celular é uma folha presa embaixo; a partir de md, um cartão no centro.
 */
export function MenuAcoesFluxo({ acoes }: { acoes: AcaoFluxo[] }) {
  const gatilho = useRef<HTMLButtonElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const id = useId();
  const idTitulo = `${id}-titulo`;

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogo.current?.showModal()}
        className={`${BOTAO_PRIMARIO} min-h-14 w-full sm:min-h-11 sm:w-auto`}
      >
        <Icone tamanho={20}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" />
        </Icone>
        O que você quer fazer?
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={idTitulo}
        onClose={() => gatilho.current?.focus()}
        // O clique no fundo (::backdrop) chega com o próprio <dialog> como alvo: o conteúdo ocupa a caixa inteira.
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl bg-superficie text-texto shadow-xl backdrop:bg-texto/60 starting:translate-y-full motion-safe:transition-[translate,opacity] motion-safe:duration-200 motion-safe:ease-out md:top-0 md:m-auto md:max-w-[420px] md:rounded-2xl md:starting:translate-y-0 md:starting:opacity-0"
      >
        <div className="painel-inferior flex flex-col gap-3 px-4 pt-5">
          <h2 id={idTitulo} className="text-lg font-bold">
            O que você quer fazer?
          </h2>
          <ul className="flex flex-col gap-2">
            {acoes.map((a, i) => (
              <li key={a.href}>
                <Link
                  href={a.href}
                  aria-labelledby={`${id}-rotulo-${i}`}
                  aria-describedby={`${id}-quando-${i}`}
                  className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 ${
                    a.destaque ? 'border-destaque bg-destaque-suave' : 'border-borda bg-superficie hover:border-destaque'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
                      a.destaque ? 'bg-destaque text-white' : 'bg-destaque-suave text-destaque'
                    }`}
                  >
                    <Icone tamanho={22}>{ICONES[a.icone]}</Icone>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span id={`${id}-quando-${i}`} className="text-sm text-texto-2">
                      {a.quando}
                    </span>
                    <span id={`${id}-rotulo-${i}`} className="text-base font-bold">
                      {a.rotulo}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-2xl leading-none text-texto-2">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => dialogo.current?.close()} className={`${BOTAO_SECUNDARIO} w-full`}>
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}
