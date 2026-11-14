import type { Metadata } from 'next';
import Link from 'next/link';
import { BOTAO_PRIMARIO } from '@/components/estilos';

export const metadata: Metadata = { title: 'Sem conexão · Gestão de Devoluções' };

/** Mostrada pelo service worker quando a navegação falha por falta de internet. Pública e estática. */
export default function PaginaSemConexao() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Sem conexão</h1>
      <p className="text-[15px]">
        O aparelho está sem internet. As fotos e os vídeos da conferência ficam guardados nele e sobem sozinhos quando a conexão voltar.
      </p>
      <p className="text-[15px] text-texto-2">Para concluir a conferência é preciso estar com internet.</p>
      <Link href="/fluxo" prefetch={false} className={`${BOTAO_PRIMARIO} min-h-14 text-lg`}>
        Tentar de novo
      </Link>
    </main>
  );
}
