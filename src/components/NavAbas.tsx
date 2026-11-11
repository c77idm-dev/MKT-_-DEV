'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AbaNav = { rotulo: string; href: string };

export function NavAbas({ abas }: { abas: AbaNav[] }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-1">
      {abas.map((aba) => {
        const ativa = caminho === aba.href || caminho.startsWith(`${aba.href}/`);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-full px-3.5 text-sm ${
              ativa ? 'bg-destaque-suave font-semibold text-destaque' : 'font-medium text-texto-2 hover:bg-fundo'
            }`}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
