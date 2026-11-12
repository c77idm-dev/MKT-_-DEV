import Link from 'next/link';
import { CartaoDevolucao } from './CartaoDevolucao';
import { rotuloTotal, type ColunaFluxo } from './QuadroFluxo';
import { BOTAO_SECUNDARIO, VAZIO } from './estilos';

/**
 * Quadro no celular (mobile-first): as 5 etapas viram botões com número e total, e os cartões da etapa
 * escolhida aparecem embaixo, um por linha. O nome acessível de cada botão traz o nome da etapa do PDF.
 */
export function EtapasCelular({ colunas, selecionada }: { colunas: ColunaFluxo[]; selecionada: number }) {
  const atual = colunas.find((c) => c.numero === selecionada) ?? colunas[0];
  if (!atual) return null;
  const cartoes = atual.cartoes ?? [];
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Etapas" className="grid grid-cols-5 gap-1.5">
        {colunas.map((c) => {
          const ativa = c.numero === atual.numero;
          return (
            <Link
              key={c.numero}
              href={`/fluxo?etapa=${c.numero}`}
              aria-current={ativa ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border ${
                ativa ? 'border-destaque bg-destaque text-white' : 'border-borda bg-superficie text-texto'
              }`}
            >
              <span aria-hidden="true" className="text-xs font-semibold">
                {c.numero}
              </span>
              <span aria-hidden="true" className="text-lg font-bold leading-none">
                {c.total}
              </span>
              <span className="sr-only">
                {c.titulo}: {rotuloTotal(c.total)}
              </span>
            </Link>
          );
        })}
      </nav>
      <section aria-labelledby="etapa-selecionada" className="flex flex-col gap-2">
        <h2 id="etapa-selecionada" className="text-base font-bold">
          {atual.numero}. {atual.titulo}
        </h2>
        {cartoes.length === 0 ? (
          <p className={VAZIO}>{atual.nota ?? 'Nenhuma devolução nesta etapa.'}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cartoes.map((d) => (
              <li key={d.id}>
                <CartaoDevolucao devolucao={d} />
              </li>
            ))}
          </ul>
        )}
        {atual.href && atual.total > 0 && (
          <Link href={atual.href} className={BOTAO_SECUNDARIO}>
            {atual.total > cartoes.length ? `Ver todas as ${rotuloTotal(atual.total)}` : 'Ver lista'}
            <span className="sr-only">: {atual.titulo}</span>
          </Link>
        )}
      </section>
    </div>
  );
}
