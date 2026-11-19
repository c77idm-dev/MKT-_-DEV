/**
 * Fila de um: cada tarefa espera a anterior terminar (com sucesso ou erro). O web roda numa vCPU com 512 MB:
 * dois dossiês ao mesmo tempo (toques repetidos, duas pessoas) dobrariam a memória sem terminar antes.
 */
export function criarSerie(): <T>(tarefa: () => Promise<T>) => Promise<T> {
  let ultima: Promise<unknown> = Promise.resolve();
  return <T>(tarefa: () => Promise<T>): Promise<T> => {
    const resultado = ultima.then(tarefa, tarefa);
    ultima = resultado.catch(() => undefined);
    return resultado;
  };
}
