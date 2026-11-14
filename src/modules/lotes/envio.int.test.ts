import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, lotes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import { registrarEnvio, registrarResultados } from './envio';

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

async function lote(status: 'FECHADO' | 'NF_EMITIDA' | 'ENVIADO', unidades = 2) {
  const f = await criarFornecedorCompletoTeste(db);
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: Array.from({ length: unidades }, () => ({ destino: 'PROBLEMA' as const })) });
  const l = await criarLoteTeste(db, { fornecedorId: f.id, status, itemIds: dev.itens.map((i) => i.id), rastreio: status === 'ENVIADO' ? 'BR1' : null });
  return { ...l, itemIds: dev.itens.map((i) => i.id) };
}
async function statusDosItens(loteId: string) {
  return (await db.select({ status: itensDevolucao.status }).from(itensDevolucao).where(eq(itensDevolucao.loteId, loteId))).map((i) => i.status);
}

describe('registrarEnvio', () => {
  it('NF emitida → Enviado, com o rastreio; as unidades vão para Enviado ao fornecedor', async () => {
    const l = await lote('NF_EMITIDA');
    await registrarEnvio(db, l.id, '  BR123456789BR ', fiscal, AGORA);
    const [linha] = await db.select().from(lotes).where(eq(lotes.id, l.id));
    expect(linha).toMatchObject({ status: 'ENVIADO', rastreioEnvio: 'BR123456789BR', enviadoEm: AGORA });
    expect(await statusDosItens(l.id)).toEqual(['ENVIADO', 'ENVIADO']);
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_enviado', de: 'NF_EMITIDA', para: 'ENVIADO', dados: { rastreio: 'BR123456789BR' } });
  });

  it('recusa sem rastreio, rastreio longo, antes da NF e o segundo clique', async () => {
    const l = await lote('NF_EMITIDA');
    await expect(registrarEnvio(db, l.id, '   ', fiscal, AGORA)).rejects.toThrow('Informe o código de rastreamento do envio.');
    await expect(registrarEnvio(db, l.id, 'X'.repeat(61), fiscal, AGORA)).rejects.toThrow('O código de rastreamento tem no máximo 60 caracteres.');
    const fechado = await lote('FECHADO');
    await expect(registrarEnvio(db, fechado.id, 'BR1', fiscal, AGORA)).rejects.toThrow('O envio só é registrado depois da NF de Remessa autorizada.');
    await registrarEnvio(db, l.id, 'BR1', fiscal, AGORA);
    await expect(registrarEnvio(db, l.id, 'BR1', fiscal, AGORA)).rejects.toThrow('O envio deste lote já foi registrado.');
    expect((await listarEventos(db, 'lote', l.id)).filter((e) => e.acao === 'lote_enviado')).toHaveLength(1);
  });

  it('clique duplo de verdade (os dois pedidos ao mesmo tempo): um registra, o outro recebe a mensagem', async () => {
    const l = await lote('NF_EMITIDA');
    const r = await Promise.allSettled([registrarEnvio(db, l.id, 'BR1', fiscal, AGORA), registrarEnvio(db, l.id, 'BR1', fiscal, AGORA)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: 'O envio deste lote já foi registrado.' }) });
    expect((await listarEventos(db, 'lote', l.id)).filter((e) => e.acao === 'lote_enviado')).toHaveLength(1);
  });

  it('Operador não registra envio nem resultado (spec §6.9)', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const emitido = await lote('NF_EMITIDA');
    await expect(registrarEnvio(db, emitido.id, 'BR1', operador, AGORA)).rejects.toThrow('Só o Fiscal ou o Gestor mexem nos lotes.');
    const enviado = await lote('ENVIADO');
    await expect(registrarResultados(db, enviado.id, [{ itemId: enviado.itemIds[0], resultado: 'TROCADO' }], operador, AGORA)).rejects.toThrow(
      'Só o Fiscal ou o Gestor mexem nos lotes.',
    );
  });
});

describe('registrarResultados', () => {
  it('grava o resultado de cada unidade; com a última resolvida, o lote vira Finalizado', async () => {
    const l = await lote('ENVIADO', 2);
    expect(await registrarResultados(db, l.id, [{ itemId: l.itemIds[0], resultado: 'CONSERTADO' }], fiscal, AGORA)).toEqual({ registrados: 1, finalizado: false });
    expect((await db.select().from(lotes).where(eq(lotes.id, l.id)))[0].status).toBe('ENVIADO');
    expect(await registrarResultados(db, l.id, [{ itemId: l.itemIds[1], resultado: 'CREDITO' }], gestor, AGORA)).toEqual({ registrados: 1, finalizado: true });
    const [linha] = await db.select().from(lotes).where(eq(lotes.id, l.id));
    expect(linha).toMatchObject({ status: 'FINALIZADO', finalizadoEm: AGORA });
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.loteId, l.id));
    expect(itens.map((i) => [i.status, i.resultadoFornecedor]).sort()).toEqual([
      ['RESOLVIDO', 'CONSERTADO'],
      ['RESOLVIDO', 'CREDITO'],
    ]);
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_finalizado', de: 'ENVIADO', para: 'FINALIZADO', usuarioNome: null });
  });

  it('recusa: nada escolhido, antes do envio, unidade já resolvida (resultado definitivo), unidade de outro lote', async () => {
    const l = await lote('ENVIADO', 2);
    await expect(registrarResultados(db, l.id, [], fiscal, AGORA)).rejects.toThrow('Escolha o resultado de pelo menos uma unidade.');
    const antes = await lote('NF_EMITIDA');
    await expect(registrarResultados(db, antes.id, [{ itemId: antes.itemIds[0], resultado: 'TROCADO' }], fiscal, AGORA)).rejects.toThrow(
      'O resultado só é registrado depois do envio.',
    );
    await registrarResultados(db, l.id, [{ itemId: l.itemIds[0], resultado: 'TROCADO' }], fiscal, AGORA);
    await expect(registrarResultados(db, l.id, [{ itemId: l.itemIds[0], resultado: 'DESCARTADO' }], fiscal, AGORA)).rejects.toThrow(
      'A unidade já tem resultado registrado.',
    );
    await expect(registrarResultados(db, l.id, [{ itemId: antes.itemIds[0], resultado: 'TROCADO' }], fiscal, AGORA)).rejects.toThrow(
      'Uma das unidades não está neste lote.',
    );
  });
});
