import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { buscarDevolucoes } from '@/modules/devolucoes/busca';
import { registrarEvento } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarContestacaoTeste, criarDevolucaoConcluidaTeste, criarNotaRejeitadaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { criarFornecedorCompletoTeste, criarLoteTeste } from '../../../tests/helpers/fabricas-lotes';
import {
  contarSemFornecedor, contestacoesComPrazoVencendo, devolucoesComAlertaLote, devolucoesComMLEncerradoAposChegada,
  devolucoesComPrazoVencendo, devolucoesEntreguesSemLeitura, lotesComAlertaNfCancelada, notasRejeitadas,
} from './alertas-devolucoes';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-17T12:00:00Z'); // terça
const horas = (n: number) => new Date(AGORA.getTime() + n * 3600_000);
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(() => sql.end());

async function devolucao(campos: Partial<typeof devolucoes.$inferInsert>) {
  const d = await criarDevolucaoTeste(db, operador);
  if (Object.keys(campos).length > 0) await db.update(devolucoes).set(campos).where(eq(devolucoes.id, d.id));
  return d;
}

describe('alertas das devoluções', () => {
  it('prazo do ML vencendo: até 24 h ou vencido, só antes da conferência', async () => {
    const a = await devolucao({ prazoConferenciaCanal: horas(2) });
    const b = await devolucao({ status: 'AGUARDANDO_CONFERENCIA', prazoConferenciaCanal: horas(-1) });
    await devolucao({ prazoConferenciaCanal: horas(48) });
    await devolucao({ status: 'AGUARDANDO_NF', prazoConferenciaCanal: horas(1) });
    expect((await devolucoesComPrazoVencendo(db, AGORA)).sort()).toEqual([a.id, b.id].sort());
  });

  it('contestações com prazo vencendo: AGUARDANDO_GESTOR e FALHOU', async () => {
    const a = await devolucao({});
    const c = await criarContestacaoTeste(db, a.id, { status: 'AGUARDANDO_GESTOR', prazo: horas(3) });
    await criarContestacaoTeste(db, (await devolucao({})).id, { status: 'ENVIADA', prazo: horas(3) });
    await criarContestacaoTeste(db, (await devolucao({})).id, { status: 'FALHOU', prazo: horas(72) });
    expect(await contestacoesComPrazoVencendo(db, AGORA)).toEqual([{ id: c.id, devolucaoCodigo: a.codigo }]);
  });

  it('NF rejeitada: de devolução e de remessa', async () => {
    const d = await devolucao({ status: 'AGUARDANDO_NF' });
    await criarNotaRejeitadaTeste(db, { devolucaoId: d.id });
    const f = await criarFornecedorCompletoTeste(db);
    const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO', tipo: 'CONSERTO' });
    await criarNotaRejeitadaTeste(db, { loteId: lote.id });
    expect(await notasRejeitadas(db)).toEqual({ devolucaoIds: [d.id], lotes: [{ codigo: lote.codigo }] });
  });

  it('itens SEM_FORNECEDOR', async () => {
    const d = await criarDevolucaoConcluidaTeste(db, operador, { concluidaEm: AGORA, unidades: [{ destino: 'PROBLEMA', motivo: 'AVARIADO' }, { destino: 'PROBLEMA', motivo: 'USADO' }] });
    for (const i of d.itens) await db.update(itensDevolucao).set({ status: 'SEM_FORNECEDOR' }).where(eq(itensDevolucao.id, i.id));
    expect(await contarSemFornecedor(db)).toBe(2);
  });

  it('(extra) Entregue (ML) sem leitura física há 2 dias úteis', async () => {
    const sexta = await devolucao({ canal: 'MERCADO_LIVRE', entregueSegundoCanalEm: new Date('2026-11-13T13:00:00Z') });
    await devolucao({ canal: 'MERCADO_LIVRE', entregueSegundoCanalEm: new Date('2026-11-16T13:00:00Z') });
    await devolucao({ canal: 'MERCADO_LIVRE', status: 'AGUARDANDO_CONFERENCIA', entregueSegundoCanalEm: new Date('2026-11-13T13:00:00Z') });
    expect(await devolucoesEntreguesSemLeitura(db, AGORA)).toEqual([sexta.id]);
  });

  it('status do ML depois da chegada: só cancelamento ou extravio, nos últimos 7 dias (decisão 10)', async () => {
    const cancelada = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const extraviada = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const entregue = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const antiga = await devolucao({ status: 'AGUARDANDO_CONFERENCIA' });
    const evento = (entidadeId: string, statusCanal: string, em: Date) =>
      registrarEvento(db, { entidade: 'devolucao', entidadeId, acao: 'ml_status_apos_chegada', usuarioId: null, em, dados: { statusCanalAnterior: 'shipped/shipped', statusCanal } });
    await evento(cancelada.id, 'cancelled/cancelled', horas(-24));
    await evento(extraviada.id, 'not_delivered/not_delivered', horas(-24));
    // A vida normal de quase toda devolução do ML: "delivered" depois da leitura física NÃO alerta.
    await evento(entregue.id, 'delivered/delivered', horas(-24));
    await evento(antiga.id, 'cancelled/cancelled', horas(-24 * 8));
    expect((await devolucoesComMLEncerradoAposChegada(db, AGORA)).sort()).toEqual([cancelada.id, extraviada.id].sort());
  });

  it('NF cancelada com o lote adiante: devolução e lote, nos últimos 7 dias', async () => {
    const recente = await devolucao({ status: 'CONCLUIDA' });

    const f = await criarFornecedorCompletoTeste(db);
    const lote = await criarLoteTeste(db, { fornecedorId: f.id, status: 'ENVIADO', tipo: 'CONSERTO' });
    await registrarEvento(db, { entidade: 'lote', entidadeId: lote.id, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: horas(-2) });
    await registrarEvento(db, { entidade: 'devolucao', entidadeId: recente.id, acao: 'lote_alerta_nf_cancelada', usuarioId: null, em: horas(-2) });
    expect(await lotesComAlertaNfCancelada(db, AGORA)).toEqual([{ codigo: lote.codigo }]);
    expect(await devolucoesComAlertaLote(db, AGORA)).toEqual([recente.id]);
  });

  it('buscarDevolucoes com ids traz só essas (a página dos alertas usa)', async () => {
    const a = await devolucao({});
    await devolucao({});
    expect((await buscarDevolucoes(db, {}, { ids: [a.id] })).devolucoes.map((d) => d.id)).toEqual([a.id]);
    expect((await buscarDevolucoes(db, {}, { ids: [] })).total).toBe(0);
  });
});
