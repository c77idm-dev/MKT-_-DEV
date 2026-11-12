import Link from 'next/link';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { CartaoDevolucao } from './CartaoDevolucao';
import { VAZIO } from './estilos';

export type ColunaFluxo = {
  numero: number;
  titulo: string;
  total: number;
  cartoes?: ResumoDevolucao[];
  href?: string;
  /** Texto curto no lugar do aviso de vazio (etapa 5: os lotes chegam numa fase posterior). */
  nota?: string;
};

export function rotuloTotal(total: number): string {
  return `${total} ${total === 1 ? 'devolução' : 'devoluções'}`;
}

/**
 * Painel da direção C no computador: uma coluna por etapa do PDF (spec §6.0), com os cartões.
 * A rolagem lateral fica dentro da caixa. No celular a página usa o EtapasCelular.
 */
export function QuadroFluxo({ colunas }: { colunas: ColunaFluxo[] }) {
  return (
    <div className="relative overflow-x-auto pb-1.5">
      <div className="flex min-w-[1300px] items-start gap-3.5">
        {colunas.map((coluna) => {
          const cartoes = coluna.cartoes ?? [];
          const escondidas = coluna.total - cartoes.length;
          return (
            <section
              key={coluna.numero}
              aria-labelledby={`coluna-${coluna.numero}`}
              className="flex flex-[1_0_248px] flex-col gap-2.5 rounded-xl bg-coluna p-3"
            >
              <div className="flex items-start gap-2 px-1 pb-1 pt-0.5">
                <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-destaque text-xs font-bold text-white">
                  {coluna.numero}
                </span>
                <h2 id={`coluna-${coluna.numero}`} className="flex-1 text-sm font-bold leading-snug">
                  {coluna.titulo}
                </h2>
                <span className="text-[13px] font-semibold text-texto-2">
                  <span aria-hidden="true">{coluna.total}</span>
                  <span className="sr-only">{rotuloTotal(coluna.total)}</span>
                </span>
              </div>
              {coluna.total === 0 && (
                <p className={VAZIO}>
                  {coluna.nota ?? 'Nenhuma devolução nesta etapa.'}
                </p>
              )}
              {cartoes.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {cartoes.map((d) => (
                    <li key={d.id}>
                      <CartaoDevolucao devolucao={d} />
                    </li>
                  ))}
                </ul>
              )}
              {coluna.href && coluna.total > 0 && (
                <Link
                  href={coluna.href}
                  className="flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold text-destaque-escuro hover:bg-superficie"
                >
                  {escondidas > 0 ? `+ ${rotuloTotal(escondidas)}` : 'Ver lista'}
                  {escondidas > 0 && ' '}
                  <span className="sr-only">{escondidas > 0 ? `em ${coluna.titulo}` : `: ${coluna.titulo}`}</span>
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
