import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contasBitbrain, contasMarketplace, devolucoes } from '@/db/schema';
import { processarResultadoConferencia } from '@/modules/mercado-livre/resultado';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarContestacaoTeste, criarExecucaoBackupTeste, criarFalhaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { configBitbrainTeste, contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { contaMLTeste, devolucaoMLConferidaTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { carregarAlertas, detalhesDosAlertas, type FontesAlertas } from './alertas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-20T12:00:00Z');
const semDisco: FontesAlertas = { usoDisco: async () => null };
beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

const ids = async (perfil: 'OPERADOR' | 'FISCAL' | 'GESTOR', fontes: FontesAlertas = semDisco) =>
  (await carregarAlertas(db, perfil, AGORA, fontes)).map((a) => a.id);

describe('carregarAlertas', () => {
  it('sem nada pendente, nenhum alerta', async () => {
    expect(await ids('GESTOR')).toEqual([]);
  });

  it('conta do ML: RECONECTAR (spec §7.1) ou sincronização parada há mais de 1 h (spec §11)', async () => {
    const { contaId } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ ultimaSincronizacaoEm: new Date('2026-11-20T10:30:00Z') }).where(eq(contasMarketplace.id, contaId));
    expect(await ids('GESTOR')).toEqual(['sincronizacao_ml']);
    expect(await ids('OPERADOR')).toEqual([]);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    expect(await ids('GESTOR')).toEqual(['conta_ml_reconectar']);
  });

  it('(extra) Falhas, backup atrasado e disco quase cheio, só para o Gestor', async () => {
    await criarFalhaTeste(db);
    await criarFalhaTeste(db);
    await criarExecucaoBackupTeste(db, { situacao: 'OK', iniciadoEm: new Date('2026-11-19T05:30:00Z') });
    const cheio = { usoDisco: async () => ({ totalBytes: 100, livreBytes: 8 }) };
    const alertas = await carregarAlertas(db, 'GESTOR', AGORA, cheio);
    expect(alertas.map((a) => [a.id, a.quantidade, a.detalhe])).toEqual([
      ['falhas', 2, null],
      ['backup', null, null],
      ['disco', null, '92% em uso'],
    ]);
    expect(await ids('FISCAL', cheio)).toEqual([]);
    await criarExecucaoBackupTeste(db, { situacao: 'OK', iniciadoEm: new Date('2026-11-20T05:30:00Z') });
    expect(await ids('GESTOR')).toEqual(['falhas']);
  });

  it('prazo do ML: o Operador conta as devoluções; o Gestor, também as contestações', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const d = await criarDevolucaoTeste(db, operador);
    await db.update(devolucoes).set({ prazoConferenciaCanal: new Date('2026-11-20T15:00:00Z') }).where(eq(devolucoes.id, d.id));
    const outra = await criarDevolucaoTeste(db, operador);
    await criarContestacaoTeste(db, outra.id, { status: 'AGUARDANDO_GESTOR', prazo: new Date('2026-11-20T18:00:00Z') });
    const quantidade = async (perfil: 'OPERADOR' | 'GESTOR') =>
      (await carregarAlertas(db, perfil, AGORA, semDisco)).find((a) => a.id === 'prazo_ml')?.quantidade;
    expect(await quantidade('OPERADOR')).toBe(1);
    expect(await quantidade('GESTOR')).toBe(2);
    const [detalhe] = await detalhesDosAlertas(db, 'GESTOR', AGORA);
    expect(detalhe).toMatchObject({ id: 'prazo_ml', devolucaoIds: [d.id] });
    expect(detalhe.links).toEqual([{ texto: `Contestação da ${outra.codigo}`, href: expect.stringMatching(/^\/contestacoes\//) }]);
  });
});

describe('modo bitbrain (integração de 18/11, D10)', () => {
  beforeEach(() => usarModoBitbrain());
  afterEach(() => vi.unstubAllEnvs());

  it('"Respostas para dar no ML": OK pendentes + contestações aguardando ou com falha; só o Gestor', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await processarResultadoConferencia(db, d.id, AGORA, configBitbrainTeste());
    const outra = await criarDevolucaoTeste(db, await criarUsuarioTeste(db), { canal: 'MERCADO_LIVRE' });
    await criarContestacaoTeste(db, outra.id, { status: 'FALHOU', prazo: new Date('2026-12-30T12:00:00Z') });
    const alerta = (await carregarAlertas(db, 'GESTOR', AGORA, semDisco)).find((a) => a.id === 'respostas_ml');
    expect(alerta).toMatchObject({ titulo: 'Respostas para dar no ML', quantidade: 2, href: '/contestacoes' });
    expect(await ids('OPERADOR')).not.toContain('respostas_ml');
  });

  it('sincronização parada contada por conta marcada; conta marcada indisponível tem alerta próprio', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
    await db.update(contasBitbrain).set({ ultimaSincronizacaoEm: new Date('2026-11-20T10:00:00Z'), atualizadaEm: new Date('2026-11-20T09:00:00Z') });
    await db.update(contasBitbrain).set({ disponivel: false }).where(eq(contasBitbrain.empresa, 'loja-falsa-2'));
    const alertas = await carregarAlertas(db, 'GESTOR', AGORA, semDisco);
    expect(alertas.find((a) => a.id === 'sincronizacao_ml')?.quantidade).toBe(1);
    expect(alertas.find((a) => a.id === 'conta_bitbrain_indisponivel')).toMatchObject({ titulo: 'Conta do ML indisponível no Bitbrain', quantidade: 1 });
  });

  it('conta em dia: sem alerta de sincronização', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await db.update(contasBitbrain).set({ ultimaSincronizacaoEm: new Date('2026-11-20T11:50:00Z') });
    expect(await ids('GESTOR')).not.toContain('sincronizacao_ml');
  });
});

describe('modo api: nada do Bitbrain aparece (regressão)', () => {
  it('OK pendente e conta indisponível não geram alerta fora do modo bitbrain', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await processarResultadoConferencia(db, d.id, AGORA, configBitbrainTeste());
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await db.update(contasBitbrain).set({ disponivel: false });
    expect(await ids('GESTOR')).toEqual([]);
  });
});
