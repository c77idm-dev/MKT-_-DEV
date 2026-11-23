import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, reclamacoesMl } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { aplicarReclamacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-23T15:00:00Z');
/** O mesmo SQL que a migração roda na subida do sistema. */
const REPARO = readFileSync(join(process.cwd(), 'drizzle', '0016_religar_reclamacoes.sql'), 'utf8');

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

const linha = async (claimId: string) => (await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId)))[0];

async function criada() {
  const externa = devolucaoExternaTeste();
  const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa), AGORA, undefined, 'loja-falsa-1');
  if (!('devolucaoId' in r)) throw new Error(`esperava uma devolução, veio ${r.acao}`);
  return { externa, devolucaoId: r.devolucaoId };
}

/** Como o defeito deixava a linha (produção, 23/11): devolucao_id e return_id nulos, o resto igual. */
async function desligar(claimId: string) {
  await db.update(reclamacoesMl).set({ devolucaoId: null, returnId: null }).where(eq(reclamacoesMl.claimId, claimId));
}

describe('migração 0016: religa as reclamações do ML desligadas da devolução (E26)', () => {
  it('religa pela reclamação: a devolução e o return_id voltam, a conta fica; rodar de novo não muda nada', async () => {
    const { externa, devolucaoId } = await criada();
    await desligar(externa.reclamacaoId);
    await sql.unsafe(REPARO);
    expect(await linha(externa.reclamacaoId)).toMatchObject({ devolucaoId, returnId: externa.devolucaoExternaId, conta: 'loja-falsa-1' });
    await sql.unsafe(REPARO);
    expect(await linha(externa.reclamacaoId)).toMatchObject({ devolucaoId, returnId: externa.devolucaoExternaId });
  });

  it('não adivinha: com duas devoluções do ML na mesma reclamação, a linha fica desligada', async () => {
    const a = await criada();
    const b = await criada();
    await db.update(devolucoes).set({ reclamacaoId: a.externa.reclamacaoId }).where(eq(devolucoes.id, b.devolucaoId));
    await desligar(a.externa.reclamacaoId);
    await sql.unsafe(REPARO);
    expect(await linha(a.externa.reclamacaoId)).toMatchObject({ devolucaoId: null, returnId: null });
    expect(await linha(b.externa.reclamacaoId)).toMatchObject({ devolucaoId: b.devolucaoId });
  });

  it('a reclamação só de consulta (sem devolução no sistema) continua sem ligação; a já ligada não muda', async () => {
    const consulta = dadosDevolucaoMLTeste(null);
    await aplicarReclamacao(db, consulta, AGORA, undefined, 'loja-falsa-1');
    const { externa, devolucaoId } = await criada();
    await sql.unsafe(REPARO);
    expect(await linha(consulta.reclamacaoId)).toMatchObject({ devolucaoId: null, returnId: null });
    expect(await linha(externa.reclamacaoId)).toMatchObject({ devolucaoId, returnId: externa.devolucaoExternaId });
  });
});
