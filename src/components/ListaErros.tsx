import { ALERTA_ERRO } from './estilos';

/** Recebe o foco quando chegam erros novos (ver useEnvioFormulario); por isso o id fixo e o tabIndex. */
export function ListaErros({ erros }: { erros: string[] }) {
  if (erros.length === 0) return null;
  return (
    <div id="erros-formulario" tabIndex={-1} role="alert" className={`${ALERTA_ERRO} scroll-mt-4 outline-none`}>
      {erros.length === 1 ? (
        <p>{erros[0]}</p>
      ) : (
        <ul className="list-disc pl-5">
          {erros.map((erro, indice) => (
            <li key={`${indice}-${erro}`}>{erro}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
