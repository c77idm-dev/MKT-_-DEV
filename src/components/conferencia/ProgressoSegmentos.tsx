/** Spec §6.0: cabeçalho com o progresso em segmentos. O estado de cada segmento também vai em texto (não só na cor). */
export function ProgressoSegmentos({ passos, atual, completos }: { passos: { chave: string; rotulo: string }[]; atual: number; completos: boolean[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-texto-2">
        <span>
          Passo {atual + 1} de {passos.length}:
        </span>{' '}
        <span className="text-texto">{passos[atual]?.rotulo}</span>
      </p>
      <ol aria-label="Progresso da conferência" className="flex gap-1">
        {passos.map((p, i) => (
          <li
            key={p.chave}
            aria-current={i === atual ? 'step' : undefined}
            className={`flex-1 rounded-full ${i === atual ? 'h-3 bg-destaque' : completos[i] ? 'h-2 bg-bom' : 'h-2 bg-borda-campo'}`}
          >
            <span className="sr-only">
              {p.rotulo}: {i === atual ? 'atual' : completos[i] ? 'completo' : 'falta'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
