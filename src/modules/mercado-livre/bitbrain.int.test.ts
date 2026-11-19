import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { contasBitbrain, devolucoes, reclamacoesMl } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { buscarNotaVendaNoCanal } from '@/modules/fiscal/nota-venda';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { salvarDadosEmpresa } from '@/modules/fiscal/configuracao';
import { configurarFiscalTeste, EMPRESA_TESTE } from '../../../tests/helpers/fabricas-fiscal';
import { contaMLTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { obterConectorML } from './conector';
import { sincronizarReclamacao } from './tarefas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  usarModoBitbrain();
  await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => sql.end());

const linha = async (claimId: string) => (await db.select().from(reclamacoesMl).where(eq(reclamacoesMl.claimId, claimId)))[0];
const devolucaoDa = async (claimId: string) => (await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.reclamacaoId, claimId)))[0];

describe('conector por conta (modo bitbrain, §4.4)', () => {
  it('com a conta: ConectorML com o vendedor da conta; sem conta ou conta desconhecida: null', async () => {
    const c = await obterConectorML(db, { conta: 'loja-falsa-2' });
    expect(c).toBeInstanceOf(ConectorML);
    expect(c?.sellerId).toBe('223456789');
    expect(await obterConectorML(db)).toBeNull();
    expect(await obterConectorML(db, { conta: 'nao-existe' })).toBeNull();
  });
});

describe('ml.sincronizar-reclamacao com a conta (D1)', () => {
  it('pela conta da tarefa: cria a devolução e grava a conta e os extras', async () => {
    await manipuladoresMercadoLivre['ml.sincronizar-reclamacao']!({ claimId: '5200000001', conta: 'loja-falsa-1' }, { db, fila, agora: AGORA, tentativa: 1 });
    const r = await linha('5200000001');
    expect(r).toMatchObject({ conta: 'loja-falsa-1', urgente: true, afetaReputacao: 'AFETA', ehFull: true, dinheiro: 'RETIDO' });
    expect(r.devolucaoId).not.toBeNull();
  });

  it('sem conta na tarefa: usa a conta gravada em reclamacoes_ml', async () => {
    await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1');
    expect(await sincronizarReclamacao(db, fila, '5200000001', AGORA)).toMatchObject({ acao: 'atualizada' });
    expect((await linha('5200000001')).conta).toBe('loja-falsa-1');
  });

  it('sem conta nenhuma: não faz nada (null)', async () => {
    expect(await sincronizarReclamacao(db, fila, '5200000001', AGORA)).toBeNull();
    expect(await db.select().from(devolucoes)).toEqual([]);
  });

  it('o Bitbrain recusa o token: lança ErroBitbrain (5 tentativas e Falhas), sem vazar o token', async () => {
    vi.stubEnv('BITBRAIN_TOKEN', 'token-errado-secreto');
    const erro = await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1').catch((e: unknown) => e);
    expect((erro as Error).message).toContain('Bitbrain recusou: confira o BITBRAIN_TOKEN');
    expect(JSON.stringify(erro)).not.toContain('token-errado-secreto');
    expect((erro as Error).message).not.toContain('token-errado-secreto');
  });

  it('empresa que o Bitbrain não tem (404 da rota): a conta fica indisponível e a tarefa termina sem erro (D21)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.insert(contasBitbrain).values({ empresa: 'loja-sumida', nome: 'Loja Sumida', sellerId: '423456789', recebeDevolucoes: true });
    expect(await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-sumida')).toBeNull();
    const [conta] = await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, 'loja-sumida'));
    expect(conta.disponivel).toBe(false);
  });
});

describe('NF de venda pela conta da devolução (§4.4)', () => {
  beforeEach(async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await configurarFiscalTeste(db, gestor);
    // O XML do ML falso sai com o CNPJ do emitente dos cenários (11222333000181).
    await salvarDadosEmpresa(db, { ...EMPRESA_TESTE, cnpj: '11222333000181' }, gestor);
  });

  it('busca o XML pela conta gravada em reclamacoes_ml', async () => {
    await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1');
    const d = await devolucaoDa('5200000001');
    expect(await buscarNotaVendaNoCanal(db, d.id, await criarUsuarioTeste(db, 'FISCAL'))).toEqual({ consultou: true, encontradas: 1 });
  });

  it('devolução do ML sem conta conhecida: não consulta', async () => {
    await sincronizarReclamacao(db, fila, '5200000001', AGORA, 'loja-falsa-1');
    await db.update(reclamacoesMl).set({ conta: null });
    const d = await devolucaoDa('5200000001');
    expect(await buscarNotaVendaNoCanal(db, d.id, await criarUsuarioTeste(db, 'FISCAL'))).toEqual({ consultou: false, encontradas: 0 });
  });
});

describe('modo api continua igual (regressão)', () => {
  it('sem o modo bitbrain: o conector da conta ATIVA do ML, como hoje; o contexto é ignorado', async () => {
    vi.unstubAllEnvs();
    await contaMLTeste(db);
    expect(await obterConectorML(db)).toBeInstanceOf(ConectorML);
    expect((await obterConectorML(db, { conta: 'loja-falsa-2' }))?.sellerId).toBe('123456789');
    expect(await db.select().from(contasBitbrain)).toHaveLength(2);
  });
});
