import type { ReactNode } from 'react';
import { iniciais } from '@/lib/iniciais';
import { ROTULO_PERFIL } from '@/modules/auth/perfis';
import { abasVisiveis } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { NavAbas } from './NavAbas';

type Props = { usuario: UsuarioSessao; acaoSair: () => Promise<void>; children: ReactNode };

export function AppShell({ usuario, acaoSair, children }: Props) {
  const abas = abasVisiveis(usuario.perfil).map(({ rotulo, href }) => ({ rotulo, href }));
  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-borda bg-superficie px-4 py-3 sm:px-8">
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
        <div className="flex-1 basis-[420px]">
          <NavAbas abas={abas} />
        </div>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-borda text-[13px] font-semibold">
            {iniciais(usuario.nome)}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{usuario.nome}</span>
            <span className="text-xs text-texto-2">{ROTULO_PERFIL[usuario.perfil]}</span>
          </div>
          <form action={acaoSair}>
            <button type="submit" className="min-h-11 rounded-full border border-borda-forte px-4 text-sm font-semibold hover:bg-fundo">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="px-4 py-5 sm:px-8">{children}</main>
    </div>
  );
}
