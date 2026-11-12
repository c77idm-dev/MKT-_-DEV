'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/estilos';

/** Erro inesperado dentro da área logada: a casca (barra de abas) continua na tela. Sem detalhes técnicos para o usuário. */
export default function ErroDaArea({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section role="alert" className="mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 text-center">
      <h1 className="text-xl font-bold">Algo deu errado.</h1>
      <p className="text-sm text-texto-2">Não foi possível abrir esta tela. Tente de novo; se continuar, volte ao Fluxo.</p>
      <div className="mt-2 grid w-full gap-2 sm:flex sm:w-auto">
        <button type="button" onClick={() => retry()} className={BOTAO_PRIMARIO}>
          Tentar de novo
        </button>
        <Link href="/fluxo" className={BOTAO_SECUNDARIO}>
          Voltar ao Fluxo
        </Link>
      </div>
    </section>
  );
}
