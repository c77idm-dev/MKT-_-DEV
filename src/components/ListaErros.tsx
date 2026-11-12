import { ALERTA_ERRO } from './estilos';

export function ListaErros({ erros }: { erros: string[] }) {
  if (erros.length === 0) return null;
  return (
    <div role="alert" className={ALERTA_ERRO}>
      {erros.length === 1 ? (
        <p>{erros[0]}</p>
      ) : (
        <ul className="list-disc pl-5">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
