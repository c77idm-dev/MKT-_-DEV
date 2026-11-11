import Link from 'next/link';

export default function PaginaNaoEncontrada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-fundo px-4 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-texto-2">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/fluxo" className="flex min-h-11 items-center font-semibold text-destaque">
        Voltar ao fluxo
      </Link>
    </main>
  );
}
