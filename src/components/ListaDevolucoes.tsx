import type { ReactNode } from 'react';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { filtrosParaQuery, POR_PAGINA_DEVOLUCOES, type FiltrosBusca } from '@/modules/devolucoes/filtros';
import { BuscaAvancada } from './BuscaAvancada';
import { CartaoDevolucao } from './CartaoDevolucao';
import { Paginacao } from './Paginacao';
import { VAZIO } from './estilos';

type Props = {
  titulo: string;
  /** Endereço da própria lista: a Busca Avançada e a paginação voltam para ele. */
  acaoBusca: string;
  filtros: FiltrosBusca;
  devolucoes: ResumoDevolucao[];
  total: number;
  pagina: number;
  acoes?: ReactNode;
};

/** Lista de devoluções em cartões (mobile-first), com a Busca Avançada no topo (spec §6.7: "disponível em todas as listas"). */
export function ListaDevolucoes({ titulo, acaoBusca, filtros, devolucoes, total, pagina, acoes }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{titulo}</h1>
        {acoes && <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto">{acoes}</div>}
      </div>
      <BuscaAvancada acao={acaoBusca} filtros={filtros} />
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? 'devolução' : 'devoluções'}
      </p>
      {devolucoes.length === 0 ? (
        <p className={VAZIO}>Nenhuma devolução encontrada.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devolucoes.map((d) => (
            <li key={d.id}>
              <CartaoDevolucao devolucao={d} />
            </li>
          ))}
        </ul>
      )}
      <Paginacao
        pagina={pagina}
        total={total}
        porPagina={POR_PAGINA_DEVOLUCOES}
        hrefDaPagina={(p) => `${acaoBusca}${filtrosParaQuery(filtros, { pagina: String(p) })}`}
      />
    </div>
  );
}
