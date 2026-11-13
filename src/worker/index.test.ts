import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { FilaMemoria } from '@/modules/fila/fila';
import { executarTarefa } from './index';

describe('executarTarefa', () => {
  it('passa os dados, o banco, a fila e a tentativa (começando em 1)', async () => {
    const manipulador = vi.fn(async () => {});
    const db = {} as Db;
    const fila = new FilaMemoria();
    const agora = new Date('2026-11-12T12:00:00Z');
    await executarTarefa({ 'midia.processar-foto': manipulador }, 'midia.processar-foto', { data: { evidenciaId: 'e1' }, retryCount: 2 }, { db, fila }, agora);
    expect(manipulador).toHaveBeenCalledWith({ evidenciaId: 'e1' }, { db, fila, agora, tentativa: 3 });
  });

  it('sem manipulador, lança (a tarefa fica para uma nova tentativa)', async () => {
    await expect(
      executarTarefa({}, 'nfe.emitir', { data: { notaFiscalId: 'n1' }, retryCount: 0 }, { db: {} as Db, fila: new FilaMemoria() }),
    ).rejects.toThrow('Nenhum manipulador para a tarefa nfe.emitir');
  });
});
