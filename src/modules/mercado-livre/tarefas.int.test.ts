import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contasMarketplace, devolucoes, motivosReclamacaoMl, notificacoesRecebidas } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import type { ContextoTarefa } from '@/worker/tipos';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { ConectorMLMemoria, contaMLTeste, dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { marcarSincronizacao, obterContaML } from './contas';
import { receberNotificacaoML } from './notificacoes';
import { JANELA_INICIAL_MS, sincronizarReclamacao, varrerReclamacoes } from './tarefas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
let fila: FilaMemoria;
let conector: ConectorMLMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  conector = new ConectorMLMemoria();
  definirConectorParaTestes('MERCADO_LIVRE', conector);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await sql.end();
});

const reclamacaoNova = (reclamacaoId: string) => dadosDevolucaoMLTeste(devolucaoExternaTeste({ reclamacaoId }));

describe('sincronizarReclamacao (tarefa ml.sincronizar-reclamacao)', () => {
  it('busca a reclamação no conector, cria a devolução e marca os avisos como processados', async () => {
    await contaMLTeste(db);
    conector.guardar(reclamacaoNova('5000000001'));
    await receberNotificacaoML(db, fila, { topico: 'post_purchase', recurso: '/post-purchase/v1/claims/5000000001', payload: { user_id: 123456789 } });
    expect(await sincronizarReclamacao(db, fila, '5000000001', AGORA)).toMatchObject({ acao: 'criada' });
    const [aviso] = await db.select().from(notificacoesRecebidas);
    expect(aviso.processadaEm).toEqual(AGORA);
  });

  it('reclamação que o ML não acha (404): termina sem erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sincronizarReclamacao(db, fila, '5999999999', AGORA)).toBeNull();
  });

  it('sem conta ATIVA (conector real, sem substituto): não faz nada', async () => {
    definirConectorParaTestes('MERCADO_LIVRE', null);
    expect(await sincronizarReclamacao(db, fila, '5000000001', AGORA)).toBeNull();
  });

  it('erro passageiro (500) lança, para a fila tentar de novo', async () => {
    conector.obterReclamacao = async () => {
      throw new ErroML(500, '', '/post-purchase/v1/claims/5000000001');
    };
    await expect(sincronizarReclamacao(db, fila, '5000000001', AGORA)).rejects.toMatchObject({ status: 500 });
  });
});

describe('motivo da reclamação na sincronização (melhoria 1)', () => {
  const comMotivo = (reclamacaoId: string) => dadosDevolucaoMLTeste(devolucaoExternaTeste({ reclamacaoId }), { motivoId: 'PDD9949' });
  async function motivoDa(reclamacaoId: string) {
    const [d] = await db.select({ motivo: devolucoes.motivoCliente }).from(devolucoes).where(eq(devolucoes.reclamacaoId, reclamacaoId));
    return d?.motivo;
  }

  it('consulta o texto do motivo uma vez só (cache) para duas reclamações com o mesmo código', async () => {
    await contaMLTeste(db);
    conector.motivos.set('PDD9949', 'Comprador se arrependeu');
    conector.guardar(comMotivo('5000000011')).guardar(comMotivo('5000000012'));
    await sincronizarReclamacao(db, fila, '5000000011', AGORA);
    await sincronizarReclamacao(db, fila, '5000000012', AGORA);
    expect(conector.consultasMotivo).toEqual(['PDD9949']);
    expect(await motivoDa('5000000011')).toBe('Comprador se arrependeu');
    expect(await motivoDa('5000000012')).toBe('Comprador se arrependeu');
    expect(await db.select({ id: motivosReclamacaoMl.id, nome: motivosReclamacaoMl.nome }).from(motivosReclamacaoMl)).toEqual([
      { id: 'PDD9949', nome: 'Comprador se arrependeu' },
    ]);
  });

  it('falha na consulta do motivo não derruba a sincronização e tenta de novo na próxima', async () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {});
    await contaMLTeste(db);
    conector.motivos.set('PDD9949', 'Comprador se arrependeu');
    conector.falhaNoMotivo = new ErroML(500, '', '/post-purchase/v1/claims/reasons/PDD9949');
    conector.guardar(comMotivo('5000000021'));
    expect(await sincronizarReclamacao(db, fila, '5000000021', AGORA)).toMatchObject({ acao: 'criada' });
    expect(await motivoDa('5000000021')).toBeNull();
    expect(await db.select().from(motivosReclamacaoMl)).toEqual([]);
    expect(erros).toHaveBeenCalled();

    conector.falhaNoMotivo = null;
    expect(await sincronizarReclamacao(db, fila, '5000000021', AGORA)).toMatchObject({ acao: 'atualizada' });
    expect(await motivoDa('5000000021')).toBe('Comprador se arrependeu');
    expect(conector.consultasMotivo).toEqual(['PDD9949', 'PDD9949']);
  });
});

describe('varrerReclamacoes (tarefa ml.varredura, a cada 15 min)', () => {
  it('primeira vez: busca 30 dias para trás, enfileira cada reclamação e grava a última sincronização', async () => {
    await contaMLTeste(db);
    conector.guardar(reclamacaoNova('5000000001')).guardar(reclamacaoNova('5000000002'));
    expect(await varrerReclamacoes(db, fila, AGORA)).toEqual({ enfileiradas: 2 });
    expect(conector.buscas).toEqual([new Date(AGORA.getTime() - JANELA_INICIAL_MS)]);
    expect(fila.enviadas.map((e) => e.dados)).toEqual([{ claimId: '5000000001' }, { claimId: '5000000002' }]);
    expect((await obterContaML(db))?.ultimaSincronizacaoEm).toEqual(AGORA);
  });

  it('depois: desde a última sincronização menos 10 minutos', async () => {
    const { contaId } = await contaMLTeste(db);
    await marcarSincronizacao(db, contaId, new Date('2026-11-12T14:45:00Z'));
    await varrerReclamacoes(db, fila, AGORA);
    expect(conector.buscas).toEqual([new Date('2026-11-12T14:35:00Z')]);
  });

  it('sem conta, ou com a conta em RECONECTAR: não varre', async () => {
    expect(await varrerReclamacoes(db, fila, AGORA)).toBeNull();
    const { contaId } = await contaMLTeste(db);
    await db.update(contasMarketplace).set({ situacao: 'RECONECTAR' }).where(eq(contasMarketplace.id, contaId));
    expect(await varrerReclamacoes(db, fila, AGORA)).toBeNull();
    expect(conector.buscas).toEqual([]);
  });
});

describe('manipuladores do worker (contrato §5.1)', () => {
  it('ml.sincronizar-reclamacao usa o db, a fila e a hora da tarefa', async () => {
    await contaMLTeste(db);
    conector.guardar(reclamacaoNova('5000000003'));
    const ctx: ContextoTarefa = { db, fila, agora: AGORA, tentativa: 1 };
    await manipuladoresMercadoLivre['ml.sincronizar-reclamacao']?.({ claimId: '5000000003' }, ctx);
    expect(await db.select().from(devolucoes)).toHaveLength(1);
  });

  it('ml.varredura e ml.renovar-token estão registrados', () => {
    expect(typeof manipuladoresMercadoLivre['ml.varredura']).toBe('function');
    expect(typeof manipuladoresMercadoLivre['ml.renovar-token']).toBe('function');
  });
});
