import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/modules/auth/servidor';
import { FormularioLogin } from './FormularioLogin';

export const metadata: Metadata = { title: 'Entrar · Gestão de Devoluções' };

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect('/fluxo');
  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Gestão de Devoluções</h1>
          <p className="text-sm text-texto-2">Entre com seu e-mail e senha.</p>
        </div>
        <FormularioLogin />
      </div>
    </main>
  );
}
