import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contasMarketplace } from '@/db/schema';
import { decifrar } from '@/lib/cifra';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configMLTeste, contaMLTeste, tokensTeste } from '../../../tests/helpers/fabricas-ml';
import { chaveCriptografia } from './config';
import { conectarConta, desconectarConta, ErroContaML, ErroContaReconectar, obterContaML, renovarContasAVencer, tokenValido } from './contas';

const { db, sql } = criarDbTeste();
const config = configMLTeste();
const chave = chaveCriptografia(config);

beforeEach(async () => {
  await limparTabelas(sql);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

const NOVO = { access_token: 'APP_USR-FALSO-NOVO', refresh_token: 'TG-FALSO-NOVO', expires_in: 21600, user_id: 123456789, scope: 'offline_access read write' };
function fetchToken(corpo: unknown = NOVO, status = 200, esperaMs = 0) {
  return vi.fn(async () => {
    if (esperaMs) await new Promise((ok) => setTimeout(ok, esperaMs));
    return new Response(JSON.stringify(corpo), { status });
  });
}
const vencendo = () => tokensTeste({ expiraEm: new Date(Date.now() + 60_000).toISOString() });

async function linha(contaId: string) {
  const [l] = await db.select().from(contasMarketplace).where(eq(contasMarketplace.id, contaId));
  return l;
}

describe('conectarConta e desconectarConta (spec §7.1)', () => {
  it('grava os tokens cifrados, ATIVA, e registra o evento', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { contaId } = await conectarConta(db, tokensTeste(), gestor, config, new Date());
    const l = await linha(contaId);
    expect(l).toMatchObject({ canal: 'MERCADO_LIVRE', sellerId: '123456789', situacao: 'ATIVA', conectadaPor: gestor.id, escopo: 'offline_access read write' });
    expect(l.accessToken).not.toContain('APP_USR');
    expect(decifrar(l.accessToken, chave)).toBe('APP_USR-FALSO-TESTE');
    expect(decifrar(l.refreshToken, chave)).toBe('TG-FALSO-TESTE');
    expect((await listarEventos(db, 'conta_marketplace', contaId)).map((e) => e.acao)).toEqual(['ml_conta_conectada']);
    expect(await obterContaML(db)).toMatchObject({ id: contaId, sellerId: '123456789', conectadaPorNome: gestor.nome, ultimaSincronizacaoEm: null });
  });

  it('conectar de novo o mesmo vendedor atualiza a conta e volta a ATIVA', async () => {
    const { contaId, gestor } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    const { contaId: mesma } = await conectarConta(db, tokensTeste({ accessToken: 'APP_USR-FALSO-2' }), gestor, config, new Date());
    expect(mesma).toBe(contaId);
    const l = await linha(contaId);
    expect(l.situacao).toBe('ATIVA');
    expect(decifrar(l.accessToken, chave)).toBe('APP_USR-FALSO-2');
  });

  it('recusa outro vendedor (uma conta por vez) e quem não é Gestor', async () => {
    const { gestor } = await contaMLTeste(db);
    await expect(conectarConta(db, tokensTeste({ userId: 999 }), gestor, config, new Date())).rejects.toThrow(/outra conta do Mercado Livre/);
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(conectarConta(db, tokensTeste(), operador, config, new Date())).rejects.toBeInstanceOf(ErroContaML);
  });

  it('desconectar apaga a conta e registra o evento', async () => {
    const { contaId, gestor } = await contaMLTeste(db);
    expect(await desconectarConta(db, gestor, new Date())).toBe(true);
    expect(await obterContaML(db)).toBeNull();
    expect((await listarEventos(db, 'conta_marketplace', contaId)).map((e) => e.acao)).toEqual(['ml_conta_conectada', 'ml_conta_desconectada']);
    expect(await desconectarConta(db, gestor, new Date())).toBe(false);
  });
});

describe('tokenValido (spec §7.1: 6 h de validade, refresh de uso único)', () => {
  it('devolve o token guardado quando ainda vale, sem chamar o ML', async () => {
    const { contaId } = await contaMLTeste(db);
    const fetchFn = fetchToken();
    expect(await tokenValido(db, contaId, { config, fetchFn })).toBe('APP_USR-FALSO-TESTE');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('renova quando faltam menos de 5 minutos e guarda os dois tokens novos', async () => {
    const { contaId } = await contaMLTeste(db, { tokens: vencendo() });
    const fetchFn = fetchToken();
    expect(await tokenValido(db, contaId, { config, fetchFn })).toBe('APP_USR-FALSO-NOVO');
    const corpo = new URLSearchParams(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(corpo.get('refresh_token')).toBe('TG-FALSO-TESTE');
    const l = await linha(contaId);
    expect(decifrar(l.refreshToken, chave)).toBe('TG-FALSO-NOVO');
    expect(l.expiraEm.getTime()).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
  });

  it('com o token recusado (401), renova mesmo dentro da validade; com outro já gravado, usa o gravado', async () => {
    const { contaId } = await contaMLTeste(db);
    expect(await tokenValido(db, contaId, { config, fetchFn: fetchToken(), recusado: 'APP_USR-FALSO-TESTE' })).toBe('APP_USR-FALSO-NOVO');
    const fetchFn = fetchToken();
    expect(await tokenValido(db, contaId, { config, fetchFn, recusado: 'APP_USR-FALSO-TESTE' })).toBe('APP_USR-FALSO-NOVO');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('invalid_grant: a conta vai para RECONECTAR, registra o evento e lança ErroContaReconectar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { contaId } = await contaMLTeste(db, { tokens: vencendo() });
    const erro = await tokenValido(db, contaId, { config, fetchFn: fetchToken({ error: 'invalid_grant', message: 'x' }, 400) }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroContaReconectar);
    expect((await linha(contaId)).situacao).toBe('RECONECTAR');
    expect((await listarEventos(db, 'conta_marketplace', contaId)).map((e) => e.acao)).toContain('ml_conta_reconectar');
    await expect(tokenValido(db, contaId, { config, fetchFn: fetchToken() })).rejects.toBeInstanceOf(ErroContaReconectar);
  });

  it('duas renovações ao mesmo tempo chamam o ML uma vez só (trava da linha)', async () => {
    const { contaId } = await contaMLTeste(db, { tokens: vencendo() });
    const fetchFn = fetchToken(NOVO, 200, 200);
    const tokens = await Promise.all([tokenValido(db, contaId, { config, fetchFn }), tokenValido(db, contaId, { config, fetchFn })]);
    expect(tokens).toEqual(['APP_USR-FALSO-NOVO', 'APP_USR-FALSO-NOVO']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('renovarContasAVencer (tarefa ml.renovar-token)', () => {
  it('renova a conta ATIVA que vence em menos de 2 horas; depois não há o que renovar', async () => {
    await contaMLTeste(db, { tokens: tokensTeste({ expiraEm: new Date(Date.now() + 60 * 60 * 1000).toISOString() }) });
    expect(await renovarContasAVencer(db, { config, fetchFn: fetchToken(), agora: new Date() })).toEqual({ renovadas: 1, reconectar: 0 });
    expect(await renovarContasAVencer(db, { config, fetchFn: fetchToken(), agora: new Date() })).toEqual({ renovadas: 0, reconectar: 0 });
  });
});
