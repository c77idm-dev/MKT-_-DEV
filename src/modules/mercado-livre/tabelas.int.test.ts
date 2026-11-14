import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contasMarketplace, contestacoesCanal, devolucoes, notificacoesRecebidas, reclamacoesMl } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

/** O postgres.js põe o nome da restrição no erro; o Drizzle pode embrulhá-lo em `cause`. */
function restricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; cause?: { constraint_name?: string } };
  return e.constraint_name ?? e.cause?.constraint_name;
}

async function devolucaoML() {
  const operador = await criarUsuarioTeste(db);
  return criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
}

describe('tabelas do Mercado Livre (contrato §4.2)', () => {
  it('conta: uma por canal e vendedor, ATIVA por padrão, sem sincronização ainda', async () => {
    const valores = { canal: 'MERCADO_LIVRE' as const, sellerId: '123', accessToken: 'a', refreshToken: 'r', expiraEm: new Date() };
    const [conta] = await db.insert(contasMarketplace).values(valores).returning();
    expect(conta).toMatchObject({ situacao: 'ATIVA', ultimaSincronizacaoEm: null, conectadaPor: null });
    const erro = await db.insert(contasMarketplace).values(valores).catch((e: unknown) => e);
    expect(restricao(erro)).toBe('contas_marketplace_canal_seller_uq');
  });

  it('contestação: uma por devolução, nasce AGUARDANDO_GESTOR, motivo só de SRF2 a SRF6', async () => {
    const d = await devolucaoML();
    const [c] = await db.insert(contestacoesCanal).values({ devolucaoId: d.id, motivoCanal: 'SRF2', mensagem: 'm' }).returning();
    expect(c).toMatchObject({ status: 'AGUARDANDO_GESTOR', evidencias: [], erro: null, revisadoPor: null, enviadaEm: null });

    const repetida = await db.insert(contestacoesCanal).values({ devolucaoId: d.id, motivoCanal: 'SRF3', mensagem: 'm' }).catch((e: unknown) => e);
    expect(restricao(repetida)).toBe('contestacoes_canal_devolucao_id_unique');

    const outra = await devolucaoML();
    const invalida = await db.insert(contestacoesCanal).values({ devolucaoId: outra.id, motivoCanal: 'SRF9', mensagem: 'm' }).catch((e: unknown) => e);
    expect(restricao(invalida)).toBe('contestacoes_canal_motivo');
  });

  it('apagar a devolução apaga a contestação e solta a reclamação (set null)', async () => {
    const d = await devolucaoML();
    await db.insert(contestacoesCanal).values({ devolucaoId: d.id, motivoCanal: 'SRF6', mensagem: 'm' });
    await db.insert(reclamacoesMl).values({ claimId: '5000000001', returnId: '6000000001', devolucaoId: d.id, sincronizadaEm: new Date() });
    await db.delete(devolucoes).where(eq(devolucoes.id, d.id));
    expect(await db.select().from(contestacoesCanal)).toEqual([]);
    const [reclamacao] = await db.select().from(reclamacoesMl);
    expect(reclamacao).toMatchObject({ claimId: '5000000001', devolucaoId: null });
  });

  it('aviso recebido guarda a referência externa (o claim_id)', async () => {
    await db.insert(notificacoesRecebidas).values({ canal: 'mercado_livre', payload: {}, referenciaExterna: '5000000001' });
    const [aviso] = await db.select().from(notificacoesRecebidas);
    expect(aviso.referenciaExterna).toBe('5000000001');
  });
});
