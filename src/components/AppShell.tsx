import type { ReactNode } from 'react';
import { iniciais } from '@/lib/iniciais';
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { abasVisiveis } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { NavAbas } from './NavAbas';

type Props = { usuario: UsuarioSessao; acaoSair: () => Promise<void>; children: ReactNode };

/** Casca da área logada. No celular a navegação vai para a barra fixa embaixo e o conteúdo ganha respiro (espaco-barra). */
export function AppShell({ usuario, acaoSair, children }: Props) {
  const abas = abasVisiveis(usuario.perfil).map(({ rotulo, href }) => ({ rotulo, href }));
  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex items-center gap-x-6 gap-y-3 border-b border-borda bg-superficie px-4 py-2.5 sm:px-8 md:flex-wrap md:py-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-full bg-destaque">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0115.5-6.2" />
              <path d="M19 3v4h-4" />
              <path d="M21 12a9 9 0 01-15.5 6.2" />
              <path d="M5 21v-4h4" />
            </svg>
          </span>
          <span className="text-lg font-bold">Devoluções</span>
        </div>
        <div className="md:flex-1 md:basis-[420px]">
          <NavAbas abas={abas} />
        </div>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-borda text-[13px] font-semibold">
            {iniciais(usuario.nome)}
          </span>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold">{usuario.nome}</span>
            <span className="text-xs text-texto-2">{ROTULO_PERFIL[usuario.perfil]}</span>
          </div>
          <form action={acaoSair}>
            <button type="submit" className="min-h-11 rounded-full border border-borda-forte px-4 text-sm font-semibold">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="espaco-barra px-4 pt-5 sm:px-8">{children}</main>
    </div>
  );
}
