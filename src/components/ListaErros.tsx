import { ALERTA_ERRO } from './estilos';

/** Id da caixa de erros: o hook useEnvioFormulario leva o foco e a rolagem até ele (reexportado lá). */
export const ID_ERROS_FORMULARIO = 'erros-formulario';

/** Recebe o foco quando chegam erros novos (ver useEnvioFormulario); por isso o id (o mesmo que o hook recebe) e o tabIndex. Com mais de uma caixa na página, dê um id próprio a cada uma. */
export function ListaErros({ erros, id = ID_ERROS_FORMULARIO }: { erros: string[]; id?: string }) {
  if (erros.length === 0) return null;
  return (
    <div id={id} tabIndex={-1} role="alert" className={`${ALERTA_ERRO} scroll-mt-4 outline-none`}>
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
