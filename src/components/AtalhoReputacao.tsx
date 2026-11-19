import Link from 'next/link';
import { filtrosParaQuery } from '@/modules/devolucoes/filtros';

/**
 * (extra) Botão ao lado de "Filtros" no Fluxo (aprovado pelo usuário): as devoluções em andamento cuja reclamação do ML
 * afeta a reputação (regra em modules/devolucoes/reputacao.ts). Um toque abre a Busca com o filtro ligado. Vermelho,
 * como os alertas de erro do painel. Some quando não há nenhuma.
 */
export function AtalhoReputacao({ total }: { total: number }) {
  if (total <= 0) return null;
  return (
    <Link
      href={`/fluxo/busca${filtrosParaQuery({ reputacao: '1' })}`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-erro-suave px-3 text-sm font-semibold text-erro hover:ring-1 hover:ring-erro/40"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      {`Afetam a reputação · ${total}`}
    </Link>
  );
}
