export type ColunaFluxo = { numero: number; titulo: string; total: number };

/** Painel da direção C: uma coluna por etapa do PDF (spec §6.0). A rolagem lateral fica dentro da caixa. */
export function QuadroFluxo({ colunas }: { colunas: ColunaFluxo[] }) {
  return (
    <div className="overflow-x-auto pb-1.5">
      <div className="flex min-w-[1300px] items-start gap-3.5">
        {colunas.map((coluna) => (
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
              <span className="text-[13px] font-semibold text-texto-2">{coluna.total}</span>
            </div>
            {coluna.total === 0 && (
              <p className="rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-[13px] text-texto-2">
                Nenhuma devolução nesta etapa
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
