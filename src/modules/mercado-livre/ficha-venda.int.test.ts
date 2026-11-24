/** Ficha da venda (extra, emenda E27): a consulta que monta a ficha de uma devolução do ML (e de uma lista, para a parte B). */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { VendaML } from '@/conectores/marketplace/mercadolivre/tipos';
import { contasBitbrain, devolucoes, motivosReclamacaoMl, produtos, vendasMl } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { fichaDaDevolucao, fichasDasDevolucoes } from './ficha-venda';
import { aplicarReclamacao } from './sincronizar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-24T15:00:00Z');
let sequencia = 0;

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

function vendaTeste(pedidoId: string, m: Partial<VendaML> = {}): VendaML {
  return {
    pedidoId,
    vendidaEm: new Date('2026-10-28T12:00:00Z'),
    situacao: 'paid',
    situacaoEnvio: 'delivered',
    itens: [{ anuncioId: 'MLB1', titulo: 'Fone de Ouvido Bluetooth', sku: 'fone-01', variacaoId: null, quantidade: 2, valorUnitario: 129.9 }],
    ...m,
  };
}

/** Devolução do ML sincronizada (reclamação ligada), com as vendas lidas. */
async function devolucaoML(p: { pedidos?: string[]; vendas?: VendaML[]; conta?: string | null; motivoId?: string | null } = {}) {
  sequencia += 1;
  const pedidos = p.pedidos ?? [`200000000${String(sequencia).padStart(7, '0')}`];
  const d = devolucaoExternaTeste({ pedidos, itens: [{ pedido: pedidos[0], sku: 'fone-01', ean: null, quantidade: 2 }] });
  const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { vendas: p.vendas ?? [], motivoId: p.motivoId ?? null }), AGORA, undefined, p.conta ?? null);
  if (!('devolucaoId' in r)) throw new Error('a devolução não foi criada');
  return { id: r.devolucaoId, codigo: r.codigo, pedidos, reclamacaoId: d.reclamacaoId };
}

describe('fichaDaDevolucao (E27)', () => {
  it('monta a ficha: pedido, data, conta, situação, itens com a foto do cadastro pelo SKU, total, link, motivo e situação da reclamação', async () => {
    await db.insert(contasBitbrain).values({ empresa: 'loja-falsa-1', nome: 'Loja Falsa 1', sellerId: '123456789', recebeDevolucoes: true });
    await db.insert(motivosReclamacaoMl).values({ id: 'PDD9949', nome: 'Comprador se arrependeu', consultadoEm: AGORA });
    await criarProdutoTeste(db, { sku: 'FONE-01' });
    await db.update(produtos).set({ fotoUrl: 'https://http2.mlstatic.com/fone.jpg', descricao: 'Fone de Ouvido (cadastro)' }).where(eq(produtos.sku, 'FONE-01'));
    const pedido = '2000008003035430';
    const d = await devolucaoML({ pedidos: [pedido], vendas: [vendaTeste(pedido)], conta: 'loja-falsa-1', motivoId: 'PDD9949' });

    expect(await fichaDaDevolucao(db, d.id)).toEqual({
      devolucaoId: d.id,
      codigo: d.codigo,
      status: 'PENDENTE_CHEGADA',
      conta: 'Loja Falsa 1',
      motivo: 'Comprador se arrependeu',
      situacaoReclamacao: 'opened',
      vendas: [
        {
          pedidoId: pedido,
          temDados: true,
          vendidaEm: '2026-10-28T12:00:00.000Z',
          situacao: 'paid',
          situacaoEnvio: 'delivered',
          itens: [
            {
              anuncioId: 'MLB1',
              titulo: 'Fone de Ouvido Bluetooth',
              sku: 'fone-01',
              variacaoId: null,
              quantidade: 2,
              valorUnitario: 129.9,
              fotoUrl: 'https://http2.mlstatic.com/fone.jpg',
            },
          ],
          total: 259.8,
          urlNoML: `https://www.mercadolivre.com.br/vendas/${pedido}/detalhe`,
        },
      ],
      produtos: [{ sku: 'FONE-01', descricao: 'Fone de Ouvido (cadastro)', fotoUrl: 'https://http2.mlstatic.com/fone.jpg', quantidade: 2 }],
    });
  });

  it('sem os dados da venda (sem linha, ou só a linha vazia do passo das antigas): temDados false, o resto da ficha continua', async () => {
    const semLinha = await devolucaoML();
    const vazia = await devolucaoML();
    await db.insert(vendasMl).values({ pedidoId: vazia.pedidos[0], atualizadaEm: AGORA });
    for (const d of [semLinha, vazia]) {
      const ficha = await fichaDaDevolucao(db, d.id);
      expect(ficha).toMatchObject({ codigo: d.codigo, situacaoReclamacao: 'opened', motivo: null, conta: null });
      expect(ficha?.vendas).toEqual([
        {
          pedidoId: d.pedidos[0],
          temDados: false,
          vendidaEm: null,
          situacao: null,
          situacaoEnvio: null,
          itens: [],
          total: null,
          urlNoML: `https://www.mercadolivre.com.br/vendas/${d.pedidos[0]}/detalhe`,
        },
      ]);
      expect(ficha?.produtos).toEqual([{ sku: 'FONE-01', descricao: null, fotoUrl: null, quantidade: 2 }]);
    }
  });

  it('motivo sem o texto no cache: o código; sem reclamação gravada (devolução manual do ML): motivo e situação nulos', async () => {
    const comCodigo = await devolucaoML({ motivoId: 'PDD0000' });
    expect(await fichaDaDevolucao(db, comCodigo.id)).toMatchObject({ motivo: 'PDD0000' });
    const operador = await criarUsuarioTeste(db);
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-DIGITADO' });
    expect(await fichaDaDevolucao(db, manual.id)).toMatchObject({
      motivo: null,
      situacaoReclamacao: null,
      vendas: [expect.objectContaining({ pedidoId: 'P-DIGITADO', temDados: false, urlNoML: null })],
    });
  });

  it('item sem SKU ou sem produto no cadastro: sem foto; item sem valor: sem total', async () => {
    const pedido = '2000000000000099';
    const venda = vendaTeste(pedido, {
      itens: [
        { anuncioId: 'MLB1', titulo: 'A', sku: null, variacaoId: null, quantidade: 1, valorUnitario: 10 },
        { anuncioId: 'MLB2', titulo: 'B', sku: 'SEM-CADASTRO', variacaoId: null, quantidade: 1, valorUnitario: null },
      ],
    });
    const d = await devolucaoML({ pedidos: [pedido], vendas: [venda] });
    const ficha = await fichaDaDevolucao(db, d.id);
    expect(ficha?.vendas[0].itens.map((i) => i.fotoUrl)).toEqual([null, null]);
    expect(ficha?.vendas[0].total).toBeNull();
  });

  it('não é do ML, não existe ou o id não é uuid: null', async () => {
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE' });
    expect(await fichaDaDevolucao(db, shopee.id)).toBeNull();
    expect(await fichaDaDevolucao(db, randomUUID())).toBeNull();
    expect(await fichaDaDevolucao(db, 'DEV-000001')).toBeNull();
  });
});

describe('fichasDasDevolucoes (E27; a lista do Receber pacote e do Conferir pacote)', () => {
  it('na ordem dos ids pedidos, só as do ML; duas devoluções do mesmo pedido mostram a mesma venda', async () => {
    const pedido = '2000000000000123';
    const a = await devolucaoML({ pedidos: [pedido], vendas: [vendaTeste(pedido)] });
    const b = await devolucaoML({ pedidos: [pedido] });
    const operador = await criarUsuarioTeste(db);
    const shopee = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE' });
    const fichas = await fichasDasDevolucoes(db, [b.id, shopee.id, randomUUID(), a.id, 'lixo']);
    expect(fichas.map((f) => f.codigo)).toEqual([b.codigo, a.codigo]);
    expect(fichas.map((f) => f.vendas[0].situacao)).toEqual(['paid', 'paid']);
    expect(await fichasDasDevolucoes(db, [])).toEqual([]);
  });

  it('o status de cada uma vem junto (a tela decide quem pode "Dar chegada")', async () => {
    const a = await devolucaoML();
    await db.update(devolucoes).set({ status: 'NO_CD_MARKETPLACE' }).where(eq(devolucoes.id, a.id));
    expect((await fichasDasDevolucoes(db, [a.id]))[0].status).toBe('NO_CD_MARKETPLACE');
  });
});
