import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { contestacoesCanal } from '@/db/schema';
import { FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { manipuladoresMercadoLivre } from '@/worker/manipuladores/mercado-livre';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ConectorMLMemoria, devolucaoMLConferidaTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { ErroContaML } from './contas';
import { processarResultadoConferencia } from './resultado';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
let conector: ConectorMLMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
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

async function acoes(id: string) {
  return (await listarEventos(db, 'devolucao', id)).map((e) => e.acao);
}

describe('processarResultadoConferencia (tarefa ml.enviar-resultado)', () => {
  it('todos BOM: manda o "OK" ao ML uma vez só e registra o evento', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }, { destino: 'BOM' }] });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_enviado');
    expect(conector.enviados).toEqual([{ devolucaoExternaId: d.externa?.devolucaoExternaId, resultado: { tipo: 'OK' } }]);
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_ja_enviado');
    expect(conector.enviados).toHaveLength(1);
    expect(await acoes(d.id)).toContain('ml_resultado_ok_enviado');
  });

  it('PROBLEMA: contestação AGUARDANDO_GESTOR com motivo, mensagem, prazo e as fotos certas (sem o vídeo)', async () => {
    const prazo = new Date('2026-11-20T23:59:59Z');
    const d = await devolucaoMLConferidaTeste(db, {
      itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'Caixa amassada.' }, { destino: 'BOM' }],
      externa: { prazoConferencia: prazo },
    });
    const [problema, bom] = d.itens;
    const foto1 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA' });
    const foto2 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_2_EMBALAGEM' });
    const foto3 = await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: problema.id });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_3_PRODUTO', itemId: bom.id });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'VIDEO_PROVA' });
    await fotoTeste(db, { devolucaoId: d.id, tipo: 'FOTO_4_CODIGO_SERIAL', itemId: problema.id, situacao: 'FALHOU' });

    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('contestacao_criada');
    const [c] = await db.select().from(contestacoesCanal);
    expect(c).toMatchObject({ devolucaoId: d.id, status: 'AGUARDANDO_GESTOR', motivoCanal: 'SRF2', prazo, revisadoPor: null });
    expect(c.mensagem).toContain('- Unidade 1 (SKU SKU-ML-1): avariado. Caixa amassada.');
    expect([...c.evidencias].sort()).toEqual([foto1.id, foto2.id, foto3.id].sort());
    expect(conector.enviados).toEqual([]);
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('contestacao_existente');
    expect((await acoes(d.id)).filter((a) => a === 'contestacao_criada')).toHaveLength(1);
  });

  it('todos AUSENTE: a devolução já está CONCLUIDA e a contestação é SRF5', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: null }] });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('contestacao_criada');
    const [c] = await db.select().from(contestacoesCanal);
    expect(c).toMatchObject({ motivoCanal: 'SRF5', evidencias: [] });
  });

  it('sem vínculo com o ML (cadastro manual): só o evento, uma vez', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }], externa: null });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('sem_vinculo');
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('sem_vinculo');
    expect((await acoes(d.id)).filter((a) => a === 'ml_resultado_sem_vinculo')).toHaveLength(1);
    expect(conector.enviados).toEqual([]);
  });

  it('outro canal ou id inexistente: nada', async () => {
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador);
    expect(await processarResultadoConferencia(db, shopee.id, AGORA)).toBe('outro_canal');
    expect(await processarResultadoConferencia(db, '00000000-0000-0000-0000-000000000000', AGORA)).toBe('sem_devolucao');
  });

  it('o ML recusa o "OK" (400): evento ml_resultado_ok_recusado, sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    conector.falhaNoEnvio = new ErroML(400, '{"message":"The return review is not available"}', '/post-purchase/v1/returns/1/return-review');
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    expect(await processarResultadoConferencia(db, d.id, AGORA)).toBe('ok_recusado');
    expect((await listarEventos(db, 'devolucao', d.id)).at(-1)).toMatchObject({
      acao: 'ml_resultado_ok_recusado',
      dados: { erro: 'The return review is not available (HTTP 400)' },
    });
  });

  it('erro passageiro (503) ou sem conta: lança, para a fila tentar de novo', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    conector.falhaNoEnvio = new ErroML(503, '', '/x');
    await expect(processarResultadoConferencia(db, d.id, AGORA)).rejects.toMatchObject({ status: 503 });
    definirConectorParaTestes('MERCADO_LIVRE', null);
    await expect(processarResultadoConferencia(db, d.id, AGORA)).rejects.toBeInstanceOf(ErroContaML);
    expect(await acoes(d.id)).not.toContain('ml_resultado_ok_enviado');
  });

  it('manipulador ml.enviar-resultado (contrato §5.4)', async () => {
    const d = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await manipuladoresMercadoLivre['ml.enviar-resultado']?.({ devolucaoId: d.id }, { db, fila: new FilaMemoria(), agora: AGORA, tentativa: 1 });
    expect(conector.enviados).toHaveLength(1);
  });
});
