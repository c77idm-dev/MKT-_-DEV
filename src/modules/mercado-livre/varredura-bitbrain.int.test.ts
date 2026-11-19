import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPRESA_FALSA_FORA_DO_AR } from '@/conectores/marketplace/bitbrain/falso';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { ConectorML } from '@/conectores/marketplace/mercadolivre/conector';
import { contasBitbrain, contasMarketplace } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { contasFalsasTeste } from '../../../tests/helpers/fabricas-bitbrain';
import { contaMLTeste, tokensTeste } from '../../../tests/helpers/fabricas-ml';
import { usarModoBitbrain } from '../../../tests/helpers/modo-bitbrain';
import { JANELA_INICIAL_MS, pedirSincronizacaoAgora, renovarTokensML, SOBREPOSICAO_MS, varrerReclamacoes } from './tarefas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-18T15:00:00Z');
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  usarModoBitbrain();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => sql.end());

const conta = async (empresa: string) => (await db.select().from(contasBitbrain).where(eq(contasBitbrain.empresa, empresa)))[0];
const contaForaDoAr = () =>
  db.insert(contasBitbrain).values({ empresa: EMPRESA_FALSA_FORA_DO_AR, nome: 'Loja Fora', sellerId: '323456789', recebeDevolucoes: true });

describe('ml.varredura no modo bitbrain (§4.4, B6)', () => {
  it('varre só as contas marcadas e disponíveis, enfileira com a conta e grava a última sincronização de cada uma', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    expect(await varrerReclamacoes(db, fila, AGORA)).toMatchObject({ enfileiradas: 1, contas: [{ empresa: 'loja-falsa-1', enfileiradas: 1 }] });
    expect(fila.enviadas.map((e) => [e.nome, e.dados])).toEqual([['ml.sincronizar-reclamacao', { claimId: '5200000001', conta: 'loja-falsa-1' }]]);
    expect((await conta('loja-falsa-1')).ultimaSincronizacaoEm).toEqual(AGORA);
    expect((await conta('loja-falsa-2')).ultimaSincronizacaoEm).toBeNull();
  });

  it('duas contas marcadas: cada uma enfileira as suas', async () => {
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1', 'loja-falsa-2'] });
    await varrerReclamacoes(db, fila, AGORA);
    expect(fila.enviadas.map((e) => e.dados)).toEqual([
      { claimId: '5200000001', conta: 'loja-falsa-1' },
      { claimId: '5500000002', conta: 'loja-falsa-2' },
    ]);
  });

  it('a conta que falha não para a outra (D6); a que falhou não anda a última sincronização', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await contaForaDoAr();
    const r = await varrerReclamacoes(db, fila, AGORA);
    expect(r).toMatchObject({ enfileiradas: 1 });
    expect(r?.contas).toEqual(
      expect.arrayContaining([
        { empresa: 'loja-falsa-1', enfileiradas: 1 },
        expect.objectContaining({ empresa: EMPRESA_FALSA_FORA_DO_AR, erro: expect.any(String) }),
      ]),
    );
    expect((await conta(EMPRESA_FALSA_FORA_DO_AR)).ultimaSincronizacaoEm).toBeNull();
  });

  it('todas as contas falham: a tarefa lança (nova tentativa e depois Falhas)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await contaForaDoAr();
    await expect(varrerReclamacoes(db, fila, AGORA)).rejects.toBeInstanceOf(ErroML);
  });

  it('empresa que o Bitbrain não tem (404 da rota): fica indisponível e a varredura não lança', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.insert(contasBitbrain).values({ empresa: 'loja-sumida', nome: 'Loja Sumida', sellerId: '423456789', recebeDevolucoes: true });
    await expect(varrerReclamacoes(db, fila, AGORA)).resolves.toMatchObject({ enfileiradas: 0 });
    expect((await conta('loja-sumida')).disponivel).toBe(false);
  });

  it('primeira varredura olha 30 dias; depois, desde a última menos 10 min', async () => {
    const espiao = vi.spyOn(ConectorML.prototype, 'reclamacoesAtualizadasDesde');
    await contasFalsasTeste(db, { recebe: ['loja-falsa-1'] });
    await varrerReclamacoes(db, fila, AGORA);
    await varrerReclamacoes(db, fila, new Date(AGORA.getTime() + 15 * 60 * 1000));
    expect(espiao.mock.calls.map(([desde]) => desde)).toEqual([new Date(AGORA.getTime() - JANELA_INICIAL_MS), new Date(AGORA.getTime() - SOBREPOSICAO_MS)]);
  });

  it('sem conta marcada: nada a fazer', async () => {
    await contasFalsasTeste(db);
    expect(await varrerReclamacoes(db, fila, AGORA)).toEqual({ enfileiradas: 0, contas: [] });
  });
});

describe('"Sincronizar agora" e ml.renovar-token no modo bitbrain', () => {
  it('pedirSincronizacaoAgora enfileira ml.varredura sem chave única (D12)', async () => {
    await pedirSincronizacaoAgora(fila);
    await pedirSincronizacaoAgora(fila);
    expect(fila.enviadas).toEqual([
      { nome: 'ml.varredura', dados: {} },
      { nome: 'ml.varredura', dados: {} },
    ]);
  });

  it('renovarTokensML não faz nada (não há token do ML deste lado, §4.2)', async () => {
    await contaMLTeste(db, { tokens: tokensTeste({ expiraEm: new Date(AGORA.getTime() + 60_000).toISOString() }) });
    expect(await renovarTokensML(db, AGORA)).toEqual({ renovadas: 0, reconectar: 0 });
    expect(await db.select().from(contasMarketplace)).toHaveLength(1);
  });
});
