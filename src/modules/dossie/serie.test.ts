import { describe, expect, it } from 'vitest';
import { criarJuncao, criarSerie, ErroFilaCheia, ErroPrazoEsgotado } from './serie';

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Promessa que o teste resolve quando quiser. */
function adiada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((ok) => {
    resolver = ok;
  });
  return { promessa, resolver };
}

describe('criarSerie (um dossiê por vez no servidor)', () => {
  it('roda um de cada vez, na ordem de chegada', async () => {
    const emSerie = criarSerie();
    const ordem: string[] = [];
    let rodando = 0;
    let maximo = 0;
    const tarefa = (nome: string, ms: number) => async () => {
      rodando += 1;
      maximo = Math.max(maximo, rodando);
      ordem.push(`início ${nome}`);
      await esperar(ms);
      ordem.push(`fim ${nome}`);
      rodando -= 1;
      return nome;
    };
    const resultados = await Promise.all([emSerie(tarefa('a', 30)), emSerie(tarefa('b', 5)), emSerie(tarefa('c', 1))]);
    expect(resultados).toEqual(['a', 'b', 'c']);
    expect(maximo).toBe(1);
    expect(ordem).toEqual(['início a', 'fim a', 'início b', 'fim b', 'início c', 'fim c']);
  });

  it('um erro não trava os próximos', async () => {
    const emSerie = criarSerie();
    const falha = emSerie(async () => {
      throw new Error('quebrou');
    });
    const depois = emSerie(async () => 'ok');
    await expect(falha).rejects.toThrow('quebrou');
    await expect(depois).resolves.toBe('ok');
  });

  it('fila limitada: com um rodando e um esperando, o 3º é recusado na hora; depois abre vaga', async () => {
    const emSerie = criarSerie({ maxPendentes: 2 });
    const a = adiada<string>();
    const primeiro = emSerie(() => a.promessa);
    const segundo = emSerie(async () => 'b');
    await expect(emSerie(async () => 'c')).rejects.toBeInstanceOf(ErroFilaCheia);
    a.resolver('a');
    await expect(primeiro).resolves.toBe('a');
    await expect(segundo).resolves.toBe('b');
    await expect(emSerie(async () => 'd')).resolves.toBe('d');
  });

  it('prazo por tarefa: a que trava é cancelada (sinal) e solta a fila para a próxima', async () => {
    const emSerie = criarSerie({ prazoMs: 30 });
    let sinalDaTravada: AbortSignal | null = null;
    const travada = emSerie((sinal) => {
      sinalDaTravada = sinal;
      return new Promise<never>(() => undefined);
    });
    const proxima = emSerie(async () => 'próxima');
    await expect(travada).rejects.toBeInstanceOf(ErroPrazoEsgotado);
    expect(sinalDaTravada!.aborted).toBe(true);
    await expect(proxima).resolves.toBe('próxima');
  });

  it('cancelada antes de entrar ou enquanto espera: nem chega a rodar', async () => {
    const emSerie = criarSerie();
    const rodou: string[] = [];
    const antes = new AbortController();
    antes.abort();
    await expect(emSerie(async () => rodou.push('antes'), { sinal: antes.signal })).rejects.toThrow();

    const a = adiada<void>();
    const primeiro = emSerie(() => a.promessa);
    const esperando = new AbortController();
    const segundo = emSerie(async () => rodou.push('esperando'), { sinal: esperando.signal });
    esperando.abort();
    a.resolver();
    await primeiro;
    await expect(segundo).rejects.toThrow();
    expect(rodou).toEqual([]);
  });

  it('o sinal do pedido chega à tarefa que está rodando', async () => {
    const emSerie = criarSerie();
    const pedido = new AbortController();
    const rodando = emSerie(
      (sinal) =>
        new Promise((_, rejeitar) => {
          sinal.addEventListener('abort', () => rejeitar(sinal.reason));
        }),
      { sinal: pedido.signal },
    );
    pedido.abort(new Error('foi embora'));
    await expect(rodando).rejects.toThrow('foi embora');
  });
});

describe('criarJuncao (toques repetidos usam a mesma geração)', () => {
  it('pedidos iguais em andamento juntam: uma execução, o mesmo resultado; terminada, a próxima roda de novo', async () => {
    const juntar = criarJuncao();
    let execucoes = 0;
    const a = adiada<string>();
    const tarefa = () => {
      execucoes += 1;
      return a.promessa;
    };
    const p1 = juntar('DEV-1:u1', undefined, tarefa);
    const p2 = juntar('DEV-1:u1', undefined, tarefa);
    const outro = juntar('DEV-2:u1', undefined, async () => 'outro');
    a.resolver('pdf');
    expect(await Promise.all([p1, p2, outro])).toEqual(['pdf', 'pdf', 'outro']);
    expect(execucoes).toBe(1);
    await expect(juntar('DEV-1:u1', undefined, async () => 'de novo')).resolves.toBe('de novo');
  });

  it('a geração só é cancelada quando todos os pedidos desistem', async () => {
    const juntar = criarJuncao();
    let sinalDaTarefa: AbortSignal | null = null;
    const tarefa = (sinal: AbortSignal) => {
      sinalDaTarefa = sinal;
      return new Promise<string>((_, rejeitar) => sinal.addEventListener('abort', () => rejeitar(sinal.reason)));
    };
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = juntar('DEV-1:u1', c1.signal, tarefa);
    const p2 = juntar('DEV-1:u1', c2.signal, tarefa);
    c1.abort();
    await esperar(1);
    expect(sinalDaTarefa!.aborted).toBe(false);
    c2.abort();
    await expect(p1).rejects.toThrow();
    await expect(p2).rejects.toThrow();
    expect(sinalDaTarefa!.aborted).toBe(true);
    // Um pedido novo depois do cancelamento começa outra geração.
    await expect(juntar('DEV-1:u1', undefined, async () => 'nova')).resolves.toBe('nova');
  });

  it('pedido já cancelado nem entra', async () => {
    const juntar = criarJuncao();
    const c = new AbortController();
    c.abort();
    let rodou = false;
    await expect(
      juntar('DEV-1:u1', c.signal, async () => {
        rodou = true;
      }),
    ).rejects.toThrow();
    expect(rodou).toBe(false);
  });
});
