import { and, asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import { devolucoes, itensDevolucao, lotes, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { cancelarNota } from '@/modules/fiscal/emissao';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste } from '../../../tests/helpers/fabricas-fiscal';
import { criarDevolucaoComProblemasTeste, criarFornecedorCompletoTeste, criarProdutoDoFornecedorTeste } from '../../../tests/helpers/fabricas-lotes';
import { autorizarDevolucaoTeste } from '../../../tests/helpers/fluxo-lotes';
import { portaLotes } from './porta';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  definirEmissorParaTestes(new EmissorFalso());
});
afterEach(() => {
  vi.restoreAllMocks();
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

describe('porta de lotes no ciclo da Fase 4 (contrato §5.7)', () => {
  it('NF de devolução autorizada: BOM disponível, PROBLEMA no lote do fornecedor, devolução concluída', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ destino: 'BOM', produtoId: p.id }, { destino: 'PROBLEMA', motivo: 'AVARIADO', produtoId: p.id }],
    });
    await autorizarDevolucaoTeste(db, fila, { devolucaoId: dev.id, codigosVenda: [p.sku, p.sku], fiscal, agora: AGORA });

    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('CONCLUIDA');
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
    const [lote] = await db.select().from(lotes);
    expect(itens.map((i) => [i.status, i.loteId])).toEqual([
      ['DISPONIVEL_VENDA', null],
      ['EM_LOTE', lote.id],
    ]);
  });
  const JUSTIFICATIVA = 'Cliente desistiu da devolução';

  async function autorizadaComProblema() {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      // A unidade 2 tem o SKU da venda (casa com a NF de venda), mas nenhum produto recebido: vai para SEM_FORNECEDOR.
      unidades: [{ destino: 'PROBLEMA', produtoId: p.id }, { destino: 'PROBLEMA', produtoId: null, sku: p.sku }],
    });
    const { notaFiscalId } = await autorizarDevolucaoTeste(db, fila, { devolucaoId: dev.id, codigosVenda: [p.sku, p.sku], fiscal, agora: AGORA });
    const [lote] = await db.select().from(lotes);
    return { dev, notaFiscalId, lote };
  }

  it('cancelar com o lote ABERTO: as unidades saem do lote e da pendência e voltam para Aguardando NF', async () => {
    const { dev, notaFiscalId, lote } = await autorizadaComProblema();
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA);
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => [i.status, i.loteId])).toEqual([
      ['AGUARDANDO_NF', null],
      ['AGUARDANDO_NF', null],
    ]);
    expect((await listarEventos(db, 'lote', lote.id)).at(-1)).toMatchObject({ acao: 'lote_item_removido' });
    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('AGUARDANDO_NF');
  });

  it('recusa o cancelamento quando a unidade está num lote que já não está ABERTO', async () => {
    const { notaFiscalId, lote } = await autorizadaComProblema();
    await db.update(lotes).set({ status: 'FECHADO', tipo: 'CONSERTO' }).where(eq(lotes.id, lote.id));
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA)).rejects.toThrow(
      `Não dá para cancelar esta NF: a unidade 1 está no lote ${lote.codigo} (Fechado).`,
    );
    const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaFiscalId));
    expect(nota.situacao).toBe('AUTORIZADA');
  });

  it('corrida com o lote FECHADO ainda sem NF: a unidade sai do lote normalmente', async () => {
    const { notaFiscalId, lote, dev } = await autorizadaComProblema();
    // A 1ª checagem (fora da transação) passa; dentro de desfazerAlocacao o lote já está fechado, mas sem NF.
    vi.spyOn(portaLotes, 'motivoParaNaoCancelarDevolucao').mockResolvedValueOnce(null);
    await db.update(lotes).set({ status: 'FECHADO', tipo: 'CONSERTO' }).where(eq(lotes.id, lote.id));
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA);
    const [item] = await db.select().from(itensDevolucao).where(and(eq(itensDevolucao.devolucaoId, dev.id), eq(itensDevolucao.unidade, 1)));
    expect(item).toMatchObject({ status: 'AGUARDANDO_NF', loteId: null });
  });

  it('corrida com o lote já em NF emitida: grava o cancelamento (como na SEFAZ), a unidade fica no lote e o alerta vai ao histórico (decisão 13)', async () => {
    const { notaFiscalId, lote, dev } = await autorizadaComProblema();
    vi.spyOn(portaLotes, 'motivoParaNaoCancelarDevolucao').mockResolvedValueOnce(null);
    await db.update(lotes).set({ status: 'NF_EMITIDA', tipo: 'CONSERTO' }).where(eq(lotes.id, lote.id));
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AGORA);
    const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaFiscalId));
    expect(nota.situacao).toBe('CANCELADA');
    const [item] = await db.select().from(itensDevolucao).where(and(eq(itensDevolucao.devolucaoId, dev.id), eq(itensDevolucao.unidade, 1)));
    expect(item).toMatchObject({ status: 'EM_LOTE', loteId: lote.id });
    expect((await listarEventos(db, 'lote', lote.id)).at(-1)).toMatchObject({ acao: 'lote_alerta_nf_cancelada', dados: { devolucaoId: dev.id, unidade: 1 } });
    expect((await listarEventos(db, 'devolucao', dev.id)).some((e) => e.acao === 'lote_alerta_nf_cancelada')).toBe(true);
  });
});
