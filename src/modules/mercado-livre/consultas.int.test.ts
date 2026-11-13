import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contestacoesCanal } from '@/db/schema';
import { registrarEvento } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste, devolucaoMLConferidaTeste } from '../../../tests/helpers/fabricas-ml';
import { resumoMLDaDevolucao } from './consultas';
import { processarResultadoConferencia } from './resultado';
import { aplicarReclamacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T15:00:00Z');
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('resumoMLDaDevolucao (seção "Mercado Livre" do detalhe)', () => {
  it('outro canal: null; ML sem vínculo: vinculada false e sem resultado', async () => {
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador);
    expect(await resumoMLDaDevolucao(db, shopee.id)).toBeNull();
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
    expect(await resumoMLDaDevolucao(db, manual.id)).toMatchObject({ vinculada: false, resultado: null, sincronizadaEm: null });
  });

  it('do ML: ids, status, entrega, prazo, última sincronização e o "OK" enviado', async () => {
    const d = devolucaoExternaTeste({ statusCanal: 'delivered/delivered', entregueEm: new Date('2026-11-12T10:00:00Z') });
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(d), AGORA);
    if (!('devolucaoId' in r)) throw new Error('a sincronização não criou a devolução');
    await registrarEvento(db, { entidade: 'devolucao', entidadeId: r.devolucaoId, acao: 'ml_resultado_ok_enviado', usuarioId: null, em: AGORA });
    expect(await resumoMLDaDevolucao(db, r.devolucaoId)).toEqual({
      vinculada: true,
      reclamacaoId: d.reclamacaoId,
      devolucaoExternaId: d.devolucaoExternaId,
      statusCanal: 'delivered/delivered',
      entregueEm: d.entregueEm,
      prazo: d.prazoConferencia,
      sincronizadaEm: AGORA,
      resultado: { tipo: 'ok', em: AGORA },
    });
  });

  it('com contestação pedida: o resultado é a contestação, "enviando"', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const dev = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO' }] });
    await processarResultadoConferencia(db, dev.id, AGORA);
    await db.update(contestacoesCanal).set({ revisadoPor: gestor.id }).where(eq(contestacoesCanal.devolucaoId, dev.id));
    expect((await resumoMLDaDevolucao(db, dev.id))?.resultado).toMatchObject({ tipo: 'contestacao', status: 'AGUARDANDO_GESTOR', enviando: true, motivo: 'SRF2' });
  });
});
