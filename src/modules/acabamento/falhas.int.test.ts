import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { falhasTarefas } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { registrarFalha, type EntradaFalha } from './falhas';

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

const entrada = (m: Partial<EntradaFalha> = {}): EntradaFalha => ({
  tarefa: 'nfe.emitir',
  dados: { notaFiscalId: 'n1' },
  erro: { message: 'Focus fora do ar' },
  tentativas: 5,
  jobId: randomUUID(),
  falhouEm: new Date('2026-11-20T10:00:00Z'),
  ...m,
});

describe('registrarFalha', () => {
  it('a mesma tarefa com os mesmos dados soma ocorrências na falha aberta (decisão 2)', async () => {
    const a = await registrarFalha(db, entrada());
    const b = await registrarFalha(db, entrada({ erro: { message: 'Tempo esgotado' }, falhouEm: new Date('2026-11-20T11:00:00Z') }));
    expect(b?.falhaId).toBe(a?.falhaId);
    const linhas = await db.select().from(falhasTarefas);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tarefa: 'nfe.emitir', ocorrencias: 2, erro: 'Tempo esgotado', tentativas: 5, situacao: 'ABERTA' });
    expect(linhas[0].primeiraFalhaEm.toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(linhas[0].ultimaFalhaEm.toISOString()).toBe('2026-11-20T11:00:00.000Z');
  });

  it('o mesmo job entregue duas vezes pela fila conta uma vez', async () => {
    const e = entrada();
    await registrarFalha(db, e);
    await registrarFalha(db, e);
    const [linha] = await db.select().from(falhasTarefas);
    expect(linha.ocorrencias).toBe(1);
  });

  it('dados diferentes viram outra falha; depois de reenviada, a próxima abre outra linha', async () => {
    const a = await registrarFalha(db, entrada());
    await registrarFalha(db, entrada({ dados: { notaFiscalId: 'n2' } }));
    await db.update(falhasTarefas).set({ situacao: 'REENVIADA' }).where(eq(falhasTarefas.id, a!.falhaId));
    const c = await registrarFalha(db, entrada());
    expect(c?.falhaId).not.toBe(a?.falhaId);
    expect(await db.select().from(falhasTarefas)).toHaveLength(3);
  });

  it('tarefa fora do contrato é ignorada', async () => {
    expect(await registrarFalha(db, entrada({ tarefa: 'outra.coisa' }))).toBeNull();
    expect(await db.select().from(falhasTarefas)).toHaveLength(0);
  });
});
