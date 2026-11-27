import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, retiradasFull } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { criarRetiradaTeste } from '../../../tests/helpers/fabricas-retiradas';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { listarApagadas } from './consultas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-27T15:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const atras = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

describe('listarApagadas (a lista Apagadas do Gestor, E29)', () => {
  it('devoluções e retiradas apagadas e não expurgadas, a mais recente primeiro, com o status, quem, quando e os dias que faltam', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    await criarDevolucaoTeste(db, operador); // normal: não entra
    const pendente = await criarDevolucaoTeste(db, operador);
    const naNf = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    const expurgada = await criarDevolucaoTeste(db, operador);
    await db.update(devolucoes).set({ apagadaEm: atras(10), apagadaPor: gestor.id }).where(eq(devolucoes.id, pendente.id));
    await db.update(devolucoes).set({ apagadaEm: atras(1), apagadaPor: null }).where(eq(devolucoes.id, naNf.id));
    await db.update(devolucoes).set({ apagadaEm: atras(95), apagadaPor: gestor.id, expurgadaEm: atras(4) }).where(eq(devolucoes.id, expurgada.id));
    await criarRetiradaTeste(db, operador, { itens: [] }); // normal: não entra
    const conferida = await criarRetiradaTeste(db, operador, { itens: [], concluidaEm: atras(20) });
    await db.update(retiradasFull).set({ apagadaEm: atras(5), apagadaPor: gestor.id }).where(eq(retiradasFull.id, conferida.id));

    expect(await listarApagadas(db, AGORA)).toEqual([
      { tipo: 'devolucao', id: naNf.id, codigo: naNf.codigo, situacao: 'Aguardando NF', apagadaEm: atras(1), apagadaPorNome: null, diasParaSumir: 89 },
      { tipo: 'retirada', id: conferida.id, codigo: conferida.codigo, situacao: 'Conferida', apagadaEm: atras(5), apagadaPorNome: gestor.nome, diasParaSumir: 85 },
      { tipo: 'devolucao', id: pendente.id, codigo: pendente.codigo, situacao: 'Pendente de chegada', apagadaEm: atras(10), apagadaPorNome: gestor.nome, diasParaSumir: 80 },
    ]);
  });

  it('nada apagado: lista vazia', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    await criarDevolucaoTeste(db, operador);
    expect(await listarApagadas(db, AGORA)).toEqual([]);
  });
});
