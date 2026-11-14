import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import { fecharLote, moverUnidades, reabrirLote } from './gestao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
});
afterAll(async () => {
  await sql.end();
});

async function loteCom(unidades: number, p: { status?: 'ABERTO' | 'FECHADO' | 'NF_EMITIDA'; fornecedorId?: string } = {}) {
  const fornecedorId = p.fornecedorId ?? (await criarFornecedorCompletoTeste(db)).id;
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: Array.from({ length: unidades }, () => ({ destino: 'PROBLEMA' as const })) });
  const lote = await criarLoteTeste(db, { fornecedorId, status: p.status ?? 'ABERTO', itemIds: dev.itens.map((i) => i.id) });
  return { ...lote, fornecedorId, itemIds: dev.itens.map((i) => i.id) };
}
async function lote(id: string) {
  const [l] = await db.select().from(lotes).where(eq(lotes.id, id));
  return l;
}
async function notaNoLote(loteId: string, situacao: 'PROCESSANDO' | 'REJEITADA' | 'AUTORIZADA' | 'CANCELADA') {
  await db.insert(notasFiscais).values({ tipo: 'REMESSA_CONSERTO', loteId, ambiente: 'HOMOLOGACAO', referenciaEmissor: randomUUID().replace(/-/g, ''), situacao });
}

describe('fecharLote', () => {
  it('ABERTO → FECHADO com o tipo, quem fechou e o evento', async () => {
    const l = await loteCom(2);
    await fecharLote(db, l.id, 'CONSERTO', fiscal, AGORA);
    expect(await lote(l.id)).toMatchObject({ status: 'FECHADO', tipo: 'CONSERTO', fechadoEm: AGORA, fechadoPor: fiscal.id });
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_fechado', de: 'ABERTO', para: 'FECHADO' });
  });

  it('recusa lote vazio, lote que não está aberto e o Operador', async () => {
    const vazio = await criarLoteTeste(db, { fornecedorId: (await criarFornecedorCompletoTeste(db)).id });
    await expect(fecharLote(db, vazio.id, 'TROCA', fiscal, AGORA)).rejects.toThrow(`O lote ${vazio.codigo} não tem unidades: não há o que fechar.`);
    const l = await loteCom(1, { status: 'FECHADO' });
    await expect(fecharLote(db, l.id, 'TROCA', fiscal, AGORA)).rejects.toThrow('Mudança não permitida no lote: Fechado → Fechado (Fiscal).');
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(fecharLote(db, (await loteCom(1)).id, 'TROCA', operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
  });
});

describe('reabrirLote (antes da NF)', () => {
  it('FECHADO → ABERTO e o tipo volta a ficar em aberto', async () => {
    const l = await loteCom(1, { status: 'FECHADO' });
    await reabrirLote(db, l.id, gestor, AGORA);
    expect(await lote(l.id)).toMatchObject({ status: 'ABERTO', tipo: null, fechadoEm: null, fechadoPor: null });
  });

  it('com NF ativa (até rejeitada) não reabre; com a NF cancelada, reabre', async () => {
    const l = await loteCom(1, { status: 'FECHADO' });
    await notaNoLote(l.id, 'REJEITADA');
    await expect(reabrirLote(db, l.id, fiscal, AGORA)).rejects.toThrow('O lote tem NF de Remessa rejeitada: ele não pode ser reaberto.');
    await db.update(notasFiscais).set({ situacao: 'CANCELADA' }).where(eq(notasFiscais.loteId, l.id));
    await reabrirLote(db, l.id, fiscal, AGORA);
    expect((await lote(l.id)).status).toBe('ABERTO');
  });

  it('com outro lote ABERTO do fornecedor, orienta a mover as unidades', async () => {
    const aberto = await loteCom(1);
    const fechado = await loteCom(1, { status: 'FECHADO', fornecedorId: aberto.fornecedorId });
    await expect(reabrirLote(db, fechado.id, fiscal, AGORA)).rejects.toThrow(
      `O fornecedor já tem o lote ${aberto.codigo} aberto: mova as unidades deste lote para ele.`,
    );
  });
});

describe('moverUnidades (spec §5.4, decisões 2 e 3)', () => {
  it('separa a troca do conserto: as unidades marcadas vão para um lote novo, já FECHADO com o tipo', async () => {
    const l = await loteCom(3);
    const { destinoCodigo } = await moverUnidades(db, { loteId: l.id, itemIds: [l.itemIds[2]], destino: { novo: 'TROCA' } }, fiscal, AGORA);
    const [novo] = await db.select().from(lotes).where(eq(lotes.codigo, destinoCodigo));
    expect(novo).toMatchObject({ status: 'FECHADO', tipo: 'TROCA', fornecedorId: l.fornecedorId, fechadoPor: fiscal.id });
    const [movido] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, l.itemIds[2]));
    expect(movido).toMatchObject({ loteId: novo.id, status: 'EM_LOTE' });
    expect((await listarEventos(db, 'item', l.itemIds[2])).at(-1)).toMatchObject({
      acao: 'lote_item_movido',
      dados: { de: l.codigo, para: novo.codigo },
    });
    await fecharLote(db, l.id, 'CONSERTO', fiscal, AGORA);
  });

  it('o lote que fica vazio continua existindo, com o histórico (decisão 3)', async () => {
    const aberto = await loteCom(1);
    const fechado = await loteCom(1, { status: 'FECHADO', fornecedorId: aberto.fornecedorId });
    const r = await moverUnidades(db, { loteId: fechado.id, itemIds: fechado.itemIds, destino: { loteId: aberto.id } }, fiscal, AGORA);
    expect(r).toEqual({ destinoCodigo: aberto.codigo });
    expect(await lote(fechado.id)).toMatchObject({ status: 'FECHADO' });
    expect((await listarEventos(db, 'lote', fechado.id)).at(-1)).toMatchObject({ acao: 'lote_item_movido' });
  });

  it('mover nos dois sentidos ao mesmo tempo não trava o banco (os dois lotes são travados em ordem de id)', async () => {
    const a = await loteCom(1);
    const b = await loteCom(1, { status: 'FECHADO', fornecedorId: a.fornecedorId });
    const r = await Promise.allSettled([
      moverUnidades(db, { loteId: a.id, itemIds: a.itemIds, destino: { loteId: b.id } }, fiscal, AGORA),
      moverUnidades(db, { loteId: b.id, itemIds: b.itemIds, destino: { loteId: a.id } }, gestor, AGORA),
    ]);
    // Sem deadlock: os dois terminam (o Postgres derrubaria um com "deadlock detected").
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('Operador não mexe em lote (spec §6.9)', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const l = await loteCom(1, { status: 'FECHADO' });
    await expect(moverUnidades(db, { loteId: l.id, itemIds: l.itemIds, destino: { novo: 'TROCA' } }, operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
    await expect(reabrirLote(db, l.id, operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
  });

  it('recusa: outro fornecedor, lote com NF ativa, unidade de outro lote, nenhuma unidade', async () => {
    const a = await loteCom(1);
    const b = await loteCom(1);
    await expect(moverUnidades(db, { loteId: a.id, itemIds: a.itemIds, destino: { loteId: b.id } }, fiscal, AGORA)).rejects.toThrow(
      'Só dá para mover unidades entre lotes do mesmo fornecedor.',
    );
    const emitido = await loteCom(1, { status: 'NF_EMITIDA' });
    await expect(moverUnidades(db, { loteId: emitido.id, itemIds: emitido.itemIds, destino: { novo: 'TROCA' } }, fiscal, AGORA)).rejects.toThrow(
      'Só dá para mover unidades de um lote aberto, ou fechado e ainda sem NF de Remessa.',
    );
    await expect(moverUnidades(db, { loteId: a.id, itemIds: b.itemIds, destino: { novo: 'TROCA' } }, fiscal, AGORA)).rejects.toThrow(
      'Uma das unidades marcadas não está neste lote.',
    );
    await expect(moverUnidades(db, { loteId: a.id, itemIds: [], destino: { novo: 'TROCA' } }, fiscal, AGORA)).rejects.toThrow(
      'Marque pelo menos uma unidade.',
    );
  });
});
