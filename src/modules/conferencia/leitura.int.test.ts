import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { configuracoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia, criarEvidenciaTeste } from '../../../tests/helpers/fabricas-conferencia';
import { obterConferencia } from './leitura';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('obterConferencia', () => {
  it('traz a devolução, a trava, as unidades com o produto esperado, as evidências e a configuração do vídeo', async () => {
    await criarProdutoTeste(db, { sku: 'FONE-01', ean: '7891000000014', descricao: 'Fone Bluetooth' });
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 2 }] });
    await criarEvidenciaTeste(db, { devolucaoId: d.id, tipo: 'FOTO_1_ETIQUETA', usuarioId: operador.id });
    // Unidade 2: leu um EAN que não é o esperado (o produto recebido fica vazio).
    await db.update(itensDevolucao).set({ eanLido: '7890000000001' }).where(eq(itensDevolucao.id, d.itens[1]));
    await db.insert(configuracoes).values({ id: 1, videoObrigatorio: 'SO_PROBLEMA' });

    const c = await obterConferencia(db, { codigo: d.codigo.toLowerCase() });
    expect(c).toMatchObject({
      id: d.id,
      codigo: d.codigo,
      status: 'EM_CONFERENCIA',
      conferenteId: operador.id,
      conferenteNome: operador.nome,
      naoIdentificada: false,
      videoObrigatorio: 'SO_PROBLEMA',
    });
    expect(c!.itens.map((i) => [i.unidade, i.sku, i.descricao, i.eanEsperado, i.eanLido, i.divergente])).toEqual([
      [1, 'FONE-01', 'Fone Bluetooth', '7891000000014', null, false],
      [2, 'FONE-01', 'Fone Bluetooth', '7891000000014', '7890000000001', true],
    ]);
    expect(c!.evidencias).toEqual([expect.objectContaining({ tipo: 'FOTO_1_ETIQUETA', itemId: null, situacao: 'RECEBIDA', caminho: null })]);
  });

  it('acha pelo id; devolve null quando não existe', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    expect((await obterConferencia(db, { id: d.id }))?.codigo).toBe(d.codigo);
    expect(await obterConferencia(db, { codigo: 'DEV-999999' })).toBeNull();
  });
});
