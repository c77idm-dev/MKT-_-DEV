import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { referenciaDaNota } from '@/modules/fiscal/dominio';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { buscarDevolucoes } from './busca';
import { contarEstoque, montarQuadro } from './quadro';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function codigos(destino: 'BOM' | 'PROBLEMA') {
  return (await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'], destino })).devolucoes.map((d) => d.codigo).sort();
}

describe('etapa 4: Estoque Bom e Estoque Problema (spec §6.4, D16)', () => {
  it('a busca separa por destino, a mesma devolução aparece nos dois e o quadro conta devoluções distintas', async () => {
    const mista = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }, { destino: 'PROBLEMA' }, { destino: 'AUSENTE' }] });
    const soBom = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }] });
    expect(await codigos('BOM')).toEqual([mista.codigo, soBom.codigo].sort());
    expect(await codigos('PROBLEMA')).toEqual([mista.codigo]);

    const { devolucoes } = await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'] });
    expect(devolucoes.find((d) => d.id === mista.id)).toMatchObject({ destinos: { bom: 1, problema: 1 }, situacaoNota: null });
    expect(await contarEstoque(db)).toEqual({ bom: 2, problema: 1 });
    expect((await montarQuadro(db)).find((c) => c.numero === 4)).toMatchObject({ total: 2, estoque: { bom: 2, problema: 1 } });
  });

  it('a NF ativa vai para o resumo e para o selo; unidade que saiu de Aguardando NF não conta', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }] });
    const id = randomUUID();
    await db.insert(notasFiscais).values({ id, tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: referenciaDaNota(id) });
    const [resumo] = (await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'] })).devolucoes;
    expect(resumo).toMatchObject({ situacaoNota: 'PROCESSANDO', selos: [{ texto: 'NF em processamento', tom: 'destaque' }] });

    await db.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.devolucaoId, dev.id));
    expect(await contarEstoque(db)).toEqual({ bom: 0, problema: 0 });
    expect((await buscarDevolucoes(db, {}, { status: ['AGUARDANDO_NF'], destino: 'BOM' })).total).toBe(0);
  });
});
