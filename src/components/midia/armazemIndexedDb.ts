import { createStore, del, set, values, type UseStore } from 'idb-keyval';
import type { ArmazemFila, RegistroEnvio } from './filaEnvios';

let loja: UseStore | null = null;

/** Banco próprio no IndexedDB do aparelho; o Blob da foto ou do vídeo é guardado junto (clone estruturado). */
function obterLoja(): UseStore {
  loja ??= createStore('devolucoes-envios', 'envios');
  return loja;
}

export function armazemIndexedDb(): ArmazemFila {
  return {
    listar: () => values<RegistroEnvio>(obterLoja()),
    gravar: (r) => set(r.idCliente, r, obterLoja()),
    apagar: (idCliente) => del(idCliente, obterLoja()),
  };
}
