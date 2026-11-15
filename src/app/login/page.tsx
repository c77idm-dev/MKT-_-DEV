import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FaixaCodigoBarras } from '@/components/FaixaCodigoBarras';
import { usuarioAtual } from '@/modules/auth/servidor';
import { FormularioLogin } from './FormularioLogin';
import { MarcaLogin } from './MarcaLogin';

export const metadata: Metadata = { title: 'Entrar · Gestão de Devoluções' };

/**
 * Celular: faixa verde da marca no topo e o formulário numa folha branca que sobe por cima dela, com o
 * "Entrar" no pé, ao alcance do polegar. Computador (md): duas metades, a faixa à esquerda e o formulário à direita.
 */
export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect('/fluxo');
  return (
    <main className="flex min-h-dvh flex-col bg-superficie md:grid md:grid-cols-2">
      <section
        aria-label="Gestão de Devoluções"
        className="flex flex-col overflow-hidden bg-destaque pt-[env(safe-area-inset-top)] text-white"
      >
        <FaixaCodigoBarras legenda="DEV · CONFERÊNCIA · NF" />
        <div className="flex flex-col gap-3 px-6 pt-7 pb-14 md:flex-1 md:justify-center md:gap-4 md:px-10 md:py-12 lg:px-16">
          <div className="flex flex-col gap-3 md:mx-auto md:w-full md:max-w-[380px] md:gap-4">
            <MarcaLogin />
            <p className="text-2xl font-bold md:text-4xl">Devoluções</p>
            {/* destaque-suave sobre #0F766E: 4,75:1 (a legenda do código de barras usa a mesma cor). */}
            <p className="max-w-[30ch] text-[15px] leading-snug text-destaque-suave md:text-lg">
              Recebimento, conferência, NF e remessas num só lugar.
            </p>
          </div>
        </div>
      </section>
      <div className="-mt-6 flex flex-1 flex-col rounded-t-3xl bg-superficie px-6 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:mt-0 md:items-center md:justify-center md:rounded-none md:px-10 md:py-12">
        <div className="flex w-full flex-1 flex-col md:max-w-[380px] md:flex-none">
          <h1 className="mb-5 text-2xl font-bold">Entrar</h1>
          <FormularioLogin />
          <p className="mt-4 text-center text-sm text-texto-2">Esqueceu a senha? Fale com o Gestor.</p>
        </div>
      </div>
    </main>
  );
}
