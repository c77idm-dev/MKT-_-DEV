/** Já há um dossiê rodando e outro esperando: o pedido é recusado na hora (a rota responde 503). */
export class ErroFilaCheia extends Error {
  constructor() {
    super('Outro dossiê está sendo gerado.');
    this.name = 'ErroFilaCheia';
  }
}

/** O dossiê passou do prazo: é cancelado e a fila segue (a rota responde 503). */
export class ErroPrazoEsgotado extends Error {
  constructor() {
    super('O dossiê passou do prazo.');
    this.name = 'ErroPrazoEsgotado';
  }
}

export type Serie = <T>(tarefa: (sinal: AbortSignal) => Promise<T>, o?: { sinal?: AbortSignal }) => Promise<T>;

/** Roda a tarefa com o sinal do pedido e o prazo; ao estourar, cancela o sinal e solta a fila mesmo que ela não pare. */
async function comPrazo<T>(tarefa: (sinal: AbortSignal) => Promise<T>, pedido: AbortSignal | undefined, prazoMs: number | undefined): Promise<T> {
  const prazo = new AbortController();
  const sinal = pedido ? AbortSignal.any([pedido, prazo.signal]) : prazo.signal;
  if (prazoMs === undefined) return tarefa(sinal);
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => {
      const erro = new ErroPrazoEsgotado();
      prazo.abort(erro);
      rejeitar(erro);
    }, prazoMs);
  });
  try {
    return await Promise.race([tarefa(sinal), estouro]);
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Fila de um: cada tarefa espera a anterior terminar (com sucesso ou erro). O web roda numa vCPU com 512 MB:
 * dois dossiês ao mesmo tempo (toques repetidos, duas pessoas) dobrariam a memória sem terminar antes.
 * `maxPendentes`: rodando + esperando; acima disso, ErroFilaCheia na hora. `prazoMs`: teto de cada tarefa (o sinal
 * dela é cancelado e a fila segue). `sinal` do pedido: cancelado antes da vez, a tarefa nem roda; rodando, ela recebe.
 */
export function criarSerie(o: { maxPendentes?: number; prazoMs?: number } = {}): Serie {
  let ultima: Promise<unknown> = Promise.resolve();
  let pendentes = 0;
  return <T>(tarefa: (sinal: AbortSignal) => Promise<T>, { sinal }: { sinal?: AbortSignal } = {}): Promise<T> => {
    if (sinal?.aborted) return Promise.reject(sinal.reason);
    if (o.maxPendentes !== undefined && pendentes >= o.maxPendentes) return Promise.reject(new ErroFilaCheia());
    pendentes += 1;
    const rodar = async (): Promise<T> => {
      try {
        sinal?.throwIfAborted();
        return await comPrazo(tarefa, sinal, o.prazoMs);
      } finally {
        pendentes -= 1;
      }
    };
    const resultado = ultima.then(rodar, rodar);
    ultima = resultado.catch(() => undefined);
    return resultado;
  };
}

type Andamento = { promessa: Promise<unknown>; controle: AbortController; interessados: number };

/**
 * Pedidos iguais (mesma chave) enquanto um está em andamento usam a mesma promessa: o toque repetido e o 2º clique
 * depois de um 504 não geram outro dossiê. A tarefa recebe um sinal que só é cancelado quando todos os pedidos que
 * esperam por ela desistiram (um pedido sem sinal espera até o fim).
 */
export function criarJuncao(): <T>(chave: string, sinal: AbortSignal | undefined, tarefa: (sinal: AbortSignal) => Promise<T>) => Promise<T> {
  const andamento = new Map<string, Andamento>();
  return <T>(chave: string, sinal: AbortSignal | undefined, tarefa: (sinal: AbortSignal) => Promise<T>): Promise<T> => {
    if (sinal?.aborted) return Promise.reject(sinal.reason);
    let atual = andamento.get(chave);
    if (!atual || atual.controle.signal.aborted) {
      const controle = new AbortController();
      const novo: Andamento = { controle, interessados: 0, promessa: Promise.resolve() };
      novo.promessa = (async () => tarefa(controle.signal))().finally(() => {
        if (andamento.get(chave) === novo) andamento.delete(chave);
      });
      andamento.set(chave, novo);
      atual = novo;
    }
    const pedido = atual;
    pedido.interessados += 1;
    if (sinal) {
      const desistir = () => {
        pedido.interessados -= 1;
        if (pedido.interessados === 0) pedido.controle.abort(sinal.reason);
      };
      sinal.addEventListener('abort', desistir, { once: true });
      const soltar = () => sinal.removeEventListener('abort', desistir);
      pedido.promessa.then(soltar, soltar);
    }
    return pedido.promessa as Promise<T>;
  };
}
