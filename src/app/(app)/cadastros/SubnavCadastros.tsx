import Link from 'next/link';

const ITENS = [
  { chave: 'produtos', rotulo: 'Produtos', href: '/cadastros/produtos' },
  { chave: 'fornecedores', rotulo: 'Fornecedores', href: '/cadastros/fornecedores' },
] as const;

/** Alternância Produtos | Fornecedores: duas metades iguais no celular. */
export function SubnavCadastros({ atual }: { atual: 'produtos' | 'fornecedores' }) {
  return (
    <nav aria-label="Cadastros" className="grid grid-cols-2 gap-1 rounded-full bg-coluna p-1 md:max-w-sm">
      {ITENS.map((item) => {
        const ativo = item.chave === atual;
        return (
          <Link
            key={item.chave}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-full px-4 text-sm ${
              ativo ? 'bg-superficie font-semibold text-destaque' : 'font-medium text-texto-2'
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
