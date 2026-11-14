import { randomUUID } from 'node:crypto';
import { sql as sqlDrizzle } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execucoesBackup, falhasTarefas } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

const falha = (assinatura: string, situacao: 'ABERTA' | 'REENVIADA' = 'ABERTA') => ({
  tarefa: 'nfe.emitir',
  dados: { notaFiscalId: 'n1' },
  assinatura,
  erro: 'Focus fora do ar',
  tentativas: 5,
  ultimoJobId: randomUUID(),
  primeiraFalhaEm: new Date(),
  ultimaFalhaEm: new Date(),
  situacao,
});

describe('tabelas da Fase 6', () => {
  it('só uma falha ABERTA por assinatura; as resolvidas podem repetir (decisão 2)', async () => {
    await db.insert(falhasTarefas).values(falha('a1'));
    await expect(db.insert(falhasTarefas).values(falha('a1'))).rejects.toThrow();
    await db.insert(falhasTarefas).values([falha('a1', 'REENVIADA'), falha('a1', 'REENVIADA')]);
    const [linha] = await db.select().from(falhasTarefas).limit(1);
    expect(linha.ocorrencias).toBe(1);
  });

  it('a execução do backup nasce EM_ANDAMENTO com a hora do início', async () => {
    const [linha] = await db.insert(execucoesBackup).values({}).returning();
    expect(linha.situacao).toBe('EM_ANDAMENTO');
    expect(linha.iniciadoEm).toBeInstanceOf(Date);
  });

  it('eventos_historico tem o índice (acao, em) dos alertas (decisão 23)', async () => {
    const r = await db.execute<{ indexdef: string }>(
      sqlDrizzle`select indexdef from pg_indexes where tablename = 'eventos_historico' and indexname = 'eventos_historico_acao_em_idx'`,
    );
    expect(r[0]?.indexdef).toMatch(/\(acao, em\)/);
  });
});
