import { describe, expect, it } from 'vitest';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';
import { obterArmazenamento, provedorAtual } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { FilaMemoria, obterFila, verificarFila } from './fila';

describe('falsos instalados pelo tests/setup/int-setup.ts (contrato §2, P2 item 10)', () => {
  it('fila e armazenamento em memória, conectores null', async () => {
    expect(obterFila()).toBeInstanceOf(FilaMemoria);
    expect(obterArmazenamento()).toBeInstanceOf(ArmazenamentoMemoria);
    expect(provedorAtual()).toBe('memoria');
    expect(await obterConector({} as DbOuTx, 'MERCADO_LIVRE')).toBeNull();
    await expect(verificarFila()).resolves.toBeUndefined();
  });

  it('cada teste começa com a fila vazia', async () => {
    await obterFila().enviar('ml.varredura', {});
    expect((obterFila() as FilaMemoria).enviadas).toHaveLength(1);
  });

  it('... e o anterior não deixa nada para o próximo', () => {
    expect((obterFila() as FilaMemoria).enviadas).toEqual([]);
  });
});
