import Link from 'next/link';
import { ABAS_ESTOQUE } from '@/modules/fiscal/dominio';

const CORES = { BOM: 'bg-bom-suave text-bom', PROBLEMA: 'bg-problema-suave text-problema' } as const;

function rotulo(total: number): string {
  return `${total} ${total === 1 ? 'devolução' : 'devoluções'}`;
}

/** A coluna 4 se divide em Estoque Bom e Estoque Problema (spec §6.0 e §6.4, D16). A mesma devolução pode contar nas duas. */
export function DivisaoEstoque({ bom, problema, empilhada = false }: { bom: number; problema: number; empilhada?: boolean }) {
  const totais = { BOM: bom, PROBLEMA: problema };
  return (
    <nav aria-label="Estoque Bom e Estoque Problema" className={empilhada ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'}>
      {ABAS_ESTOQUE.map((aba) => (
        <Link
          key={aba.destino}
          href={aba.href}
          aria-label={`${aba.rotulo}: ${rotulo(totais[aba.destino])}`}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-semibold ${CORES[aba.destino]}`}
        >
          <span>{aba.rotulo}</span>
          <span>{totais[aba.destino]}</span>
        </Link>
      ))}
    </nav>
  );
}
