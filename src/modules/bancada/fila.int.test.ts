import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, reclamacoesMl, retiradasFull } from '@/db/schema';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { criarNaoIdentificada } from '@/modules/devolucoes/recebimento';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarRetiradaTeste } from '../../../tests/helpers/fabricas-retiradas';
import { listarFilaBancada } from './fila';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

async function emStatus(
  usuario: Awaited<ReturnType<typeof criarUsuarioTeste>>,
  status: StatusDevolucao,
  extra: { recebidaEm?: Date; conferenteId?: string; canal?: 'MERCADO_LIVRE' | 'SHOPEE' } = {},
) {
  const d = await criarDevolucaoTeste(db, usuario, { canal: extra.canal ?? 'SHOPEE', itens: [{ sku: 'FONE-01', quantidade: 1 }] });
  await db
    .update(devolucoes)
    .set({
      status,
      recebidaEm: status === 'PENDENTE_CHEGADA' ? null : (extra.recebidaEm ?? new Date()),
      recebidaPor: status === 'PENDENTE_CHEGADA' ? null : usuario.id,
      conferenteId: extra.conferenteId ?? null,
      conferenciaIniciadaEm: extra.conferenteId ? new Date() : null,
    })
    .where(eq(devolucoes.id, d.id));
  return d;
}

describe('listarFilaBancada (E29)', () => {
  it('separa o que espera conferência, o que é da pessoa e as retiradas abertas, cada um na sua ordem', async () => {
    const eu = await criarUsuarioTeste(db, 'OPERADOR');
    const colega = await criarUsuarioTeste(db, 'OPERADOR');
    await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone Bluetooth' });

    await emStatus(eu, 'PENDENTE_CHEGADA');
    const antiga = await emStatus(eu, 'AGUARDANDO_CONFERENCIA', { recebidaEm: new Date('2026-11-27T10:00:00Z') });
    const nova = await emStatus(eu, 'AGUARDANDO_CONFERENCIA', { recebidaEm: new Date('2026-11-27T11:00:00Z') });
    // A urgente do ML chegou por último e vem primeiro (a ordem da etapa 2 do quadro).
    const urgente = await emStatus(eu, 'AGUARDANDO_CONFERENCIA', { recebidaEm: new Date('2026-11-27T12:00:00Z'), canal: 'MERCADO_LIVRE' });
    await db.insert(reclamacoesMl).values({ claimId: '5000009001', devolucaoId: urgente.id, urgente: true, sincronizadaEm: new Date() });
    const minha = await emStatus(eu, 'EM_CONFERENCIA', { conferenteId: eu.id });
    await emStatus(colega, 'EM_CONFERENCIA', { conferenteId: colega.id });
    await emStatus(eu, 'AGUARDANDO_NF');
    await emStatus(eu, 'NO_CD_MARKETPLACE');

    const velha = await criarRetiradaTeste(db, eu, { itens: [], etiqueta: 'FULL-VELHA' });
    const recente = await criarRetiradaTeste(db, eu, { itens: [], etiqueta: 'FULL-RECENTE' });
    await criarRetiradaTeste(db, eu, { itens: [], concluidaEm: new Date(), etiqueta: 'FULL-CONCLUIDA' });
    // As mais antigas primeiro: a "velha" foi aberta antes.
    await db.update(retiradasFull).set({ recebidaEm: new Date('2026-11-26T09:00:00Z') }).where(eq(retiradasFull.id, velha.id));

    const fila = await listarFilaBancada(db, eu.id);
    expect(fila.esperando.map((c) => c.codigo)).toEqual([urgente.codigo, antiga.codigo, nova.codigo]);
    expect(fila.totalEsperando).toBe(3);
    expect(fila.esperando[0]).toMatchObject({ id: urgente.id, urgenteML: true, naoIdentificada: false, titulo: 'Fone Bluetooth' });
    expect(fila.esperando[1]).toMatchObject({ urgenteML: false, chegouEm: new Date('2026-11-27T10:00:00Z') });
    // Só a EM_CONFERENCIA travada com a pessoa; a do colega não aparece em lugar nenhum.
    expect(fila.continuar.map((c) => c.codigo)).toEqual([minha.codigo]);
    expect(fila.retiradas.map((r) => r.codigo)).toEqual([velha.codigo, recente.codigo]);
    expect(fila.retiradas[0]).toMatchObject({ id: velha.id, abertaEm: new Date('2026-11-26T09:00:00Z'), codigoEtiqueta: 'FULL-VELHA' });
  });

  it('a não identificada espera o Gestor: aparece marcada (sem produto)', async () => {
    const eu = await criarUsuarioTeste(db, 'OPERADOR');
    const ni = await criarNaoIdentificada(db, 'BRDESCONHECIDO1', eu);
    const fila = await listarFilaBancada(db, eu.id);
    expect(fila.esperando).toEqual([expect.objectContaining({ codigo: ni.codigo, naoIdentificada: true, titulo: 'Pacote não identificado' })]);
  });

  it('vazia: as três listas vazias', async () => {
    const eu = await criarUsuarioTeste(db, 'OPERADOR');
    expect(await listarFilaBancada(db, eu.id)).toEqual({ esperando: [], totalEsperando: 0, continuar: [], retiradas: [] });
  });
});
