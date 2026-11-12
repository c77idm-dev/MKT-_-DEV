import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ETAPAS } from './etapas';
import { montarQuadro } from './quadro';
import { receberPorRastreio } from './recebimento';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('montarQuadro', () => {
  it('conta por etapa e traz até 5 cartões por coluna', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    for (let i = 0; i < 6; i++) await criarDevolucaoTeste(db, operador);
    const chegou = await criarDevolucaoTeste(db, operador, { rastreio: 'BRQUADRO' });
    await receberPorRastreio(db, 'BRQUADRO', operador);

    const quadro = await montarQuadro(db);
    expect(quadro.map((c) => c.titulo)).toEqual(ETAPAS.map((e) => e.titulo));
    expect(quadro.map((c) => [c.numero, c.total, c.cartoes.length, c.href])).toEqual([
      [1, 6, 5, '/fluxo/etapa/1'],
      [2, 1, 1, '/fluxo/etapa/2'],
      [3, 0, 0, '/fluxo/etapa/3'],
      [4, 0, 0, '/fluxo/etapa/4'],
      [5, 0, 0, '/fluxo/etapa/5'],
    ]);
    expect(quadro[1].cartoes[0].codigo).toBe(chegou.codigo);
  });
});
