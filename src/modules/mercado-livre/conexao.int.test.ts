import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFalsoML } from '@/conectores/marketplace/mercadolivre/falso';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { FilaMemoria } from '@/modules/fila/fila';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configMLTeste } from '../../../tests/helpers/fabricas-ml';
import { chaveCriptografia } from './config';
import { concluirConexaoML } from './conexao';
import { obterContaML } from './contas';
import { criarEstadoOAuth } from './oauth-estado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
const config = configMLTeste();
let fila: FilaMemoria;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

function estado(usuarioId = gestor.id, agora = AGORA) {
  return criarEstadoOAuth({ usuarioId, usarPkce: false, chave: chaveCriptografia(config), agora });
}
function concluir(cookie: string | undefined, parametros: Record<string, string>, fetchFn: typeof fetch = fetchFalsoML) {
  return concluirConexaoML(db, fila, { cookie, parametros: new URLSearchParams(parametros), usuario: gestor, config, fetchFn, agora: AGORA });
}

describe('concluirConexaoML (retorno do OAuth, spec §7.1)', () => {
  it('state certo: troca o código, grava a conta ATIVA e enfileira a primeira varredura', async () => {
    const { cookie, state } = estado();
    expect(await concluir(cookie, { code: 'TG-FALSO-abc', state })).toBe('conectada');
    expect(await obterContaML(db)).toMatchObject({ sellerId: '123456789', situacao: 'ATIVA' });
    expect(fila.enviadas.map((e) => e.nome)).toEqual(['ml.varredura']);
  });

  it('state errado, cookie ausente, vencido ou de outro usuário: "estado", sem chamar o ML', async () => {
    const fetchFn = vi.fn(fetchFalsoML);
    const { cookie, state } = estado();
    expect(await concluir(cookie, { code: 'TG-FALSO-abc', state: 'outro' }, fetchFn)).toBe('estado');
    expect(await concluir(undefined, { code: 'TG-FALSO-abc', state }, fetchFn)).toBe('estado');
    const velho = estado(gestor.id, new Date(AGORA.getTime() - 11 * 60_000));
    expect(await concluir(velho.cookie, { code: 'TG-FALSO-abc', state: velho.state }, fetchFn)).toBe('estado');
    const deOutro = estado('00000000-0000-0000-0000-000000000000');
    expect(await concluir(deOutro.cookie, { code: 'TG-FALSO-abc', state: deOutro.state }, fetchFn)).toBe('estado');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await obterContaML(db)).toBeNull();
  });

  it('autorização negada no ML, e retorno sem código', async () => {
    const { cookie, state } = estado();
    expect(await concluir(cookie, { error: 'access_denied', state })).toBe('negada');
    expect(await concluir(cookie, { state })).toBe('sem_codigo');
  });

  it('conta de colaborador (invalid_operator_user_id) e outras recusas do ML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cookie, state } = estado();
    const colaborador = vi.fn(async () => new Response('{"error":"invalid_operator_user_id","message":"invalid_operator_user_id"}', { status: 403 }));
    expect(await concluir(cookie, { code: 'TG-x', state }, colaborador)).toBe('colaborador');
    const recusa = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    expect(await concluir(cookie, { code: 'TG-x', state }, recusa)).toBe('troca');
  });
});
