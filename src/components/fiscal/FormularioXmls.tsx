import { BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from '../estilos';

/** Spec §8.7: ZIP com os XMLs do período para importar no Bitbrain. Formulário GET: o navegador baixa o arquivo. */
export function FormularioXmls({ de, ate }: { de: string; ate: string }) {
  return (
    <details className={CARTAO}>
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-bold">Baixar XMLs do período</summary>
      <form method="get" action="/api/fiscal/xmls" className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-texto-2">
          ZIP com os XMLs das NF autorizadas e dos cancelamentos no período (até 31 dias), para importar no Bitbrain.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xmls-de" className={ROTULO}>
              De
            </label>
            <input id="xmls-de" name="de" type="date" required defaultValue={de} className={CAMPO} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xmls-ate" className={ROTULO}>
              Até
            </label>
            <input id="xmls-ate" name="ate" type="date" required defaultValue={ate} className={CAMPO} />
          </div>
        </div>
        <button type="submit" className={BOTAO_SECUNDARIO}>
          Baixar XMLs
        </button>
      </form>
    </details>
  );
}
