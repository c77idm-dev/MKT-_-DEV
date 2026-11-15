import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { falhasTarefas } from '@/db/schema';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarFalhaTeste } from '../../../tests/helpers/fabricas-acabamento';
import { dispensarFalha, ErroFalhas, listarFalhas, reenviarFalha } from './falhas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-20T12:00:00Z');
let fila: FilaMemoria;
beforeEach(async () => {
  await limparTabelas(sql);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
});
afterAll(() => sql.end());

describe('Tentar de novo (spec §6.8)', () => {
  it('reenvia a mesma tarefa com os mesmos dados, sem chave única, e registra no histórico', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db, { tarefa: 'nfe.consultar', dados: { notaFiscalId: 'n1', consulta: 150 } });
    expect(await reenviarFalha(db, id, gestor, AGORA)).toEqual({ tarefa: 'nfe.consultar' });
    expect(fila.enviadas.map(({ nome, dados }) => ({ nome, dados }))).toEqual([{ nome: 'nfe.consultar', dados: { notaFiscalId: 'n1', consulta: 150 } }]);
    expect(fila.enviadas[0].opcoes?.chaveUnica).toBeUndefined();
    const [f] = await db.select().from(falhasTarefas).where(eq(falhasTarefas.id, id));
    expect(f).toMatchObject({ situacao: 'REENVIADA', resolvidaPor: gestor.id });
    expect(f.resolvidaEm?.toISOString()).toBe(AGORA.toISOString());
    const eventos = await listarEventos(db, 'configuracao', 'falhas');
    expect(eventos.map((e) => [e.acao, e.dados?.falhaId])).toEqual([['tarefa_reenviada', id]]);
  });

  it('clique duplo: um reenvio só, e o segundo recebe a mensagem', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db, { tarefa: 'limpeza.temporarios', dados: {} });
    const r = await Promise.allSettled([reenviarFalha(db, id, gestor), reenviarFalha(db, id, gestor)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toEqual(new ErroFalhas('Esta falha já foi tratada.'));
    expect(fila.enviadas).toHaveLength(1);
  });

  it('só o Gestor; id inválido ou inexistente', async () => {
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db);
    await expect(reenviarFalha(db, id, fiscal)).rejects.toThrow('Só o Gestor trata as Falhas.');
    await expect(reenviarFalha(db, 'abc', gestor)).rejects.toThrow('Falha não encontrada.');
    await expect(reenviarFalha(db, '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', gestor)).rejects.toThrow('Falha não encontrada.');
    expect(fila.enviadas).toHaveLength(0);
  });
});

describe('Dispensar (extra, decisão 4)', () => {
  it('ABERTA → DISPENSADA, sem reenviar, com o evento tarefa_dispensada', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const { id } = await criarFalhaTeste(db);
    await dispensarFalha(db, id, gestor, AGORA);
    const [f] = await db.select().from(falhasTarefas).where(eq(falhasTarefas.id, id));
    expect(f.situacao).toBe('DISPENSADA');
    expect(fila.enviadas).toHaveLength(0);
    expect((await listarEventos(db, 'configuracao', 'falhas')).map((e) => e.acao)).toEqual(['tarefa_dispensada']);
    await expect(dispensarFalha(db, id, gestor)).rejects.toThrow('Esta falha já foi tratada.');
  });
});

describe('listarFalhas', () => {
  it('só as abertas, a mais recente primeiro, com o nome da tarefa e a referência', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const dev = await criarDevolucaoTeste(db, operador);
    await criarFalhaTeste(db, { tarefa: 'ml.enviar-resultado', dados: { devolucaoId: dev.id }, ultimaFalhaEm: new Date('2026-11-20T10:00:00Z') });
    await criarFalhaTeste(db, { tarefa: 'ml.sincronizar-reclamacao', dados: { claimId: '5012345678' }, ultimaFalhaEm: new Date('2026-11-20T11:00:00Z') });
    await criarFalhaTeste(db, { situacao: 'REENVIADA' });
    const { falhas, total } = await listarFalhas(db);
    expect(total).toBe(2);
    expect(falhas.map((f) => [f.rotuloTarefa, f.referencia])).toEqual([
      ['Sincronizar reclamação do Mercado Livre', { texto: 'Reclamação 5012345678', href: null }],
      ['Enviar o resultado da conferência ao ML', { texto: dev.codigo, href: `/fluxo/devolucoes/${dev.codigo}` }],
    ]);
  });
});
