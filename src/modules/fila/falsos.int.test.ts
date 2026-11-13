import { afterAll, describe, expect, it } from 'vitest';
import { obterConector } from '@/conectores/marketplace/registro';
import { obterArmazenamento, provedorAtual } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { FilaMemoria, obterFila, verificarFila } from './fila';

const { db, sql } = criarDbTeste();
afterAll(async () => {
  await sql.end();
});

describe('falsos instalados pelo tests/setup/int-setup.ts (contrato §2, P2 item 10)', () => {
  it('fila e armazenamento em memória, conectores null', async () => {
    expect(obterFila()).toBeInstanceOf(FilaMemoria);
    expect(obterArmazenamento()).toBeInstanceOf(ArmazenamentoMemoria);
    expect(provedorAtual()).toBe('memoria');
    await limparTabelas(sql);
    // o conector real é null sem conta ATIVA (Fase 3)
    expect(await obterConector(db, 'MERCADO_LIVRE')).toBeNull();
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
