import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import { lotes, notasFiscais, produtos, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste } from '../../../tests/helpers/fabricas-fiscal';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { cancelarNota } from '@/modules/fiscal/emissao';
import { reabrirLote } from './gestao';
import { cancelarNotaRemessa, emitirNotaRemessa, reenviarNotaRemessa } from './remessa';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
const JUSTIFICATIVA = 'Remessa emitida para o fornecedor errado';
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let fila: FilaMemoria;
let emissor: EmissorQueGuarda;

class EmissorQueGuarda extends EmissorFalso {
  emitidas: NotaParaEmissao[] = [];
  override async emitir(nota: NotaParaEmissao) {
    this.emitidas.push(nota);
    return super.emitir(nota);
  }
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  emissor = new EmissorQueGuarda();
  definirEmissorParaTestes(emissor);
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

/** Lote FECHADO (Conserto) de um fornecedor em MG (a empresa de teste é de SP: operação fora do estado). */
async function loteFechado(p: { ncm?: string | null } = {}) {
  const f = await criarFornecedorCompletoTeste(db);
  const prod = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj, ncm: p.ncm });
  const dev = await criarDevolucaoComProblemasTeste(db, gestor, { unidades: [{ destino: 'PROBLEMA', produtoId: prod.id, serial: 'SN-1' }, { destino: 'PROBLEMA', produtoId: prod.id, serial: 'SN-2' }] });
  const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id) });
  return { ...lote, produtoId: prod.id };
}
async function loteDe(id: string) {
  const [l] = await db.select().from(lotes).where(eq(lotes.id, id));
  return l;
}
async function notaDe(id: string) {
  const [n] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  return n;
}

describe('NF de Remessa no ciclo da Fase 4 (spec §6.5, §8.6)', () => {
  it('emite, a SEFAZ autoriza e o lote vai para NF emitida', async () => {
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    expect(await notaDe(notaFiscalId)).toMatchObject({ tipo: 'REMESSA_CONSERTO', loteId: l.id, devolucaoId: null, situacao: 'PROCESSANDO' });
    await rodarTarefasFiscais(db, fila, AGORA);

    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'AUTORIZADA' });
    expect(await loteDe(l.id)).toMatchObject({ status: 'NF_EMITIDA', notaFiscalId });
    expect(emissor.emitidas[0]).toMatchObject({ tipo: 'REMESSA_CONSERTO', operacao: 'FORA_ESTADO', informacoesComplementares: `Lote ${l.codigo}. S/N: SN-1, SN-2.` });
    expect(emissor.emitidas[0].itens).toEqual([expect.objectContaining({ cfop: '6915', quantidade: 2, valorUnitario: 35.9 })]);
    // No lote, só a mudança de status (mesma transação); a solicitação fica na própria nota (Fase 4, decisão 18).
    expect((await listarEventos(db, 'lote', l.id)).map((e) => e.acao)).toEqual(['nf_autorizada']);
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).map((e) => e.acao)).toEqual(['nf_solicitada', 'nf_autorizada']);
  });

  it('regime Presumido: a nota sai com CST 41 (spec §12, "para cada regime")', async () => {
    await configurarFiscalTeste(db, gestor, { regime: 'PRESUMIDO' });
    const l = await loteFechado();
    await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect(emissor.emitidas[0]).toMatchObject({ regime: 'PRESUMIDO' });
    expect(emissor.emitidas[0].itens[0].icmsSituacao).toBe('41');
    expect((await loteDe(l.id)).status).toBe('NF_EMITIDA');
  });

  it('emitir e reabrir ao mesmo tempo: nunca fica lote ABERTO com NF (decisão 5)', async () => {
    const l = await loteFechado();
    const [emissao, reabertura] = await Promise.allSettled([emitirNotaRemessa(db, l.id, fiscal), reabrirLote(db, l.id, gestor, AGORA)]);
    const lote = await loteDe(l.id);
    const notas = await db.select().from(notasFiscais).where(eq(notasFiscais.loteId, l.id));
    expect([emissao.status, reabertura.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
    if (emissao.status === 'fulfilled') expect([lote.status, notas.length]).toEqual(['FECHADO', 1]);
    else expect([lote.status, notas.length]).toEqual(['ABERTO', 0]);
  });

  it('dois "Emitir" ao mesmo tempo: uma nota só, e a mensagem fala do lote', async () => {
    const l = await loteFechado();
    const r = await Promise.allSettled([emitirNotaRemessa(db, l.id, fiscal), emitirNotaRemessa(db, l.id, gestor)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: expect.stringMatching(/^O lote já tem (outra )?NF de Remessa em processamento\.$/) }) });
    expect(await db.select().from(notasFiscais).where(eq(notasFiscais.loteId, l.id))).toHaveLength(1);
  });

  it('recusa antes de criar a nota: lote aberto, falta NCM, NF já ativa', async () => {
    const aberto = await criarLoteTeste(db, { fornecedorId: (await criarFornecedorCompletoTeste(db)).id });
    await expect(emitirNotaRemessa(db, aberto.id, fiscal)).rejects.toThrow('Feche o lote antes de emitir a NF de Remessa.');
    const semNcm = await loteFechado({ ncm: null });
    await expect(emitirNotaRemessa(db, semNcm.id, fiscal)).rejects.toThrow(/: falta o NCM\./);
    expect(await db.select().from(notasFiscais)).toHaveLength(0);
    const l = await loteFechado();
    await emitirNotaRemessa(db, l.id, fiscal);
    await expect(emitirNotaRemessa(db, l.id, fiscal)).rejects.toThrow('O lote já tem NF de Remessa em processamento.');
  });

  it('rejeitada: o lote continua Fechado; corrigir a regra e reenviar autoriza', async () => {
    await db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto REJEITAR' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO'));
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('REJEITADA');
    expect((await loteDe(l.id)).status).toBe('FECHADO');
    await expect(emitirNotaRemessa(db, l.id, fiscal)).rejects.toThrow('O lote tem NF de Remessa rejeitada: use "Corrigir e reenviar".');

    await db.update(regrasFiscais).set({ naturezaOperacao: 'Remessa para conserto' }).where(eq(regrasFiscais.tipoNota, 'REMESSA_CONSERTO'));
    await reenviarNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    expect((await loteDe(l.id)).status).toBe('NF_EMITIDA');
  });

  it('cancelar a NF de Remessa devolve o lote para Fechado; depois do envio, não cancela', async () => {
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    await cancelarNotaRemessa(db, l.id, JUSTIFICATIVA, fiscal, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('CANCELADA');
    expect(await loteDe(l.id)).toMatchObject({ status: 'FECHADO', notaFiscalId: null });

    const segunda = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(segunda.notaFiscalId)).situacao).toBe('AUTORIZADA');
    await db.update(lotes).set({ status: 'ENVIADO', rastreioEnvio: 'BR1' }).where(eq(lotes.id, l.id));
    await expect(cancelarNotaRemessa(db, l.id, JUSTIFICATIVA, fiscal, AGORA)).rejects.toThrow(
      'Só dá para cancelar a NF de Remessa antes de registrar o envio.',
    );
  });

  it('corrida: envio registrado no meio do cancelamento da NF de Remessa → cancelamento gravado e alerta no lote (decisão 13)', async () => {
    const l = await loteFechado();
    const { notaFiscalId } = await emitirNotaRemessa(db, l.id, fiscal);
    await rodarTarefasFiscais(db, fila, AGORA);
    await db.update(lotes).set({ status: 'ENVIADO', rastreioEnvio: 'BR1' }).where(eq(lotes.id, l.id));
    // Direto pela Fase 4 (o atalho da tela recusaria antes): simula o envio que chegou depois da checagem.
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('CANCELADA');
    expect((await loteDe(l.id)).status).toBe('ENVIADO');
    expect((await listarEventos(db, 'lote', l.id)).at(-1)).toMatchObject({ acao: 'lote_alerta_nf_cancelada', dados: { loteStatus: 'ENVIADO' } });
  });

  it('o produto sem custo vira mensagem, não erro técnico', async () => {
    const l = await loteFechado();
    await db.update(produtos).set({ custo: null }).where(eq(produtos.id, l.produtoId));
    await expect(emitirNotaRemessa(db, l.id, fiscal)).rejects.toThrow(/: falta o custo\./);
  });
});
