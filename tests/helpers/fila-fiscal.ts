import type { Db } from '@/db/client';
import type { FilaMemoria } from '@/modules/fila/fila';
import type { DadosTarefa } from '@/modules/fila/tarefas';
import { manipuladoresFiscal } from '@/worker/manipuladores/fiscal';

const jaRodadas = new WeakMap<FilaMemoria, number>();

/**
 * Faz o papel do worker nos testes de integração: roda, em ordem, as tarefas `nfe.*` enviadas à FilaMemoria (as que os
 * manipuladores enviam entram no fim e também rodam), sem esperar o `iniciarEm`. Devolve os nomes das que rodaram.
 */
export async function rodarTarefasFiscais(db: Db, fila: FilaMemoria, agora: Date = new Date(), limite = 20): Promise<string[]> {
  const rodadas: string[] = [];
  while (rodadas.length < limite) {
    const indice = jaRodadas.get(fila) ?? 0;
    const tarefa = fila.enviadas[indice];
    if (!tarefa) break;
    jaRodadas.set(fila, indice + 1);
    const ctx = { db, fila, agora, tentativa: 1 };
    if (tarefa.nome === 'nfe.emitir') {
      await manipuladoresFiscal['nfe.emitir']?.(tarefa.dados as DadosTarefa['nfe.emitir'], ctx);
    } else if (tarefa.nome === 'nfe.consultar') {
      await manipuladoresFiscal['nfe.consultar']?.(tarefa.dados as DadosTarefa['nfe.consultar'], ctx);
    } else {
      continue;
    }
    rodadas.push(tarefa.nome);
  }
  return rodadas;
}
