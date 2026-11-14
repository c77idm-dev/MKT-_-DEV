import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FilaMemoria } from '@/modules/fila/fila';
import { TAREFAS_NA_SUBIDA } from '@/modules/fila/tarefas';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { manipuladoresLotes } from './lotes';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('manipuladores da Fase 5 (contrato §5.1)', () => {
  it('lotes.alocar-pendentes roda na subida do worker e termina sem erro com o banco vazio', async () => {
    expect(TAREFAS_NA_SUBIDA).toContain('lotes.alocar-pendentes');
    const manipulador = manipuladoresLotes['lotes.alocar-pendentes'];
    expect(manipulador).toBeDefined();
    await expect(manipulador?.({}, { db, fila: new FilaMemoria(), agora: new Date(), tentativa: 1 })).resolves.toBeUndefined();
  });
});
