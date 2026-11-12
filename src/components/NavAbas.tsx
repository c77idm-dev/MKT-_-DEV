'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type AbaNav = { rotulo: string; href: string };

/** Traços dos ícones (viewBox 24×24), um por aba do menu (spec §6.0). */
const ICONES: Record<string, ReactNode> = {
  '/fluxo': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  '/contestacoes': (
    <>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v4M12 14h.01" />
    </>
  ),
  '/lotes': (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  '/cadastros': (
    <>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <path d="M7.5 7.5h.01" />
    </>
  ),
  '/configuracoes': <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
};

/** Rótulos curtos só para o celular (barra estreita); o nome acessível continua o rótulo completo. */
const ROTULO_CURTO: Record<string, string> = {
  '/fluxo': 'Fluxo',
  '/contestacoes': 'Contestações',
  '/lotes': 'Lotes',
  '/cadastros': 'Cadastros',
  '/configuracoes': 'Config.',
};

/**
 * No celular: barra fixa embaixo, com ícone e nome, respeitando a área segura.
 * A partir de md: as abas em pílula na barra superior, como na Fase 0.
 */
export function NavAbas({ abas }: { abas: AbaNav[] }) {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Seções"
      className="seguro-inferior fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-borda bg-superficie md:static md:z-auto md:flex md:flex-wrap md:gap-1 md:border-0 md:bg-transparent"
    >
      {abas.map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? 'page' : undefined}
            aria-label={aba.rotulo}
            data-curto={ROTULO_CURTO[aba.href] ?? aba.rotulo}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] leading-tight break-words after:content-[attr(data-curto)] md:after:hidden md:min-h-11 md:flex-row md:rounded-full md:px-3.5 md:text-sm ${
              ativa ? 'font-semibold text-destaque md:bg-destaque-suave' : 'font-medium text-texto-2 md:hover:bg-fundo'
            }`}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="md:hidden"
            >
              {ICONES[aba.href]}
            </svg>
            <span className="max-md:sr-only">{aba.rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
