import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarFornecedorTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { buscarDevolucoes, type OpcoesBusca } from './busca';
import type { DevolucaoCriada } from './criar';
import type { FiltrosBusca } from './filtros';

const { db, sql } = criarDbTeste();
let a: DevolucaoCriada;
let b: DevolucaoCriada;
let c: DevolucaoCriada;

async function codigos(filtros: FiltrosBusca, opcoes: OpcoesBusca = {}) {
  return (await buscarDevolucoes(db, filtros, opcoes)).devolucoes.map((d) => d.codigo).sort();
}

beforeEach(async () => {
  await limparTabelas(sql);
  const operador = await criarUsuarioTeste(db, 'OPERADOR');
  await criarFornecedorTeste(db, {
    razaoSocial: 'Alfa Eletrônicos Ltda',
    cnpj: '11222333000181',
  });
  await criarProdutoTeste(db, {
    sku: 'FONE-01',
    descricao: 'Fone Bluetooth',
    ean: '7891000000014',
    cnpjFornecedor: '11222333000181',
  });
  a = await criarDevolucaoTeste(db, operador, {
    canal: 'SHOPEE',
    pedido: 'SHP-100',
    reclamacaoId: 'REC-9',
    rastreio: 'BR111222333',
    itens: [{ sku: 'FONE-01', quantidade: 2 }],
  });
  b = await criarDevolucaoTeste(db, operador, {
    canal: 'AMAZON',
    pedido: 'AMZ-200',
    rastreio: 'AM999',
    itens: [{ sku: 'OUTRO-1', quantidade: 1 }],
  });
  c = await criarDevolucaoTeste(db, operador, {
    canal: 'MAGALU',
    pedido: 'MGL-300',
    rastreio: 'MG555',
  });
  await db.update(devolucoes).set({ status: 'AGUARDANDO_CONFERENCIA' }).where(eq(devolucoes.id, c.id));
});
afterAll(async () => {
  await sql.end();
});

describe('buscarDevolucoes (Busca Avançada, spec §6.7)', () => {
  it('sem filtro traz todas, da mais nova para a mais antiga', async () => {
    const r = await buscarDevolucoes(db, {});
    expect(r.total).toBe(3);
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([c.codigo, b.codigo, a.codigo]);
  });

  it('Código de Rastreamento: parte do código, sem diferenciar maiúsculas', async () => {
    expect(await codigos({ rastreio: 'br111' })).toEqual([a.codigo]);
  });

  it('Número do Pedido e ID da Reclamação/Mediação', async () => {
    expect(await codigos({ pedido: 'amz' })).toEqual([b.codigo]);
    expect(await codigos({ reclamacao: 'rec-9' })).toEqual([a.codigo]);
  });

  it('Marketplace de Origem e Status Operacional Atual', async () => {
    expect(await codigos({ canal: 'SHOPEE' })).toEqual([a.codigo]);
    expect(await codigos({ status: 'AGUARDANDO_CONFERENCIA' })).toEqual([c.codigo]);
  });

  it('Fornecedor: pelo nome ou pelo CNPJ', async () => {
    expect(await codigos({ fornecedor: 'alfa' })).toEqual([a.codigo]);
    expect(await codigos({ fornecedor: '11.222.333' })).toEqual([a.codigo]);
    expect(await codigos({ fornecedor: 'Beta' })).toEqual([]);
  });

  it('Código de Barras / Serial Number', async () => {
    expect(await codigos({ codigo: '7891000000014' })).toEqual([a.codigo]);
    await db.update(itensDevolucao).set({ serial: 'SN-XYZ' }).where(eq(itensDevolucao.devolucaoId, b.id));
    expect(await codigos({ codigo: 'sn-xyz' })).toEqual([b.codigo]);
  });

  it('Código de Barras: só dígitos vai para o EAN; SKU fora do catálogo é achado; serial em várias unidades não duplica', async () => {
    expect(await codigos({ codigo: 'SN-7891000000014' })).toEqual([]);
    await criarProdutoTeste(db, { sku: 'EAN-123', descricao: 'Cabo', ean: '123', cnpjFornecedor: '11222333000181' });
    expect(await codigos({ codigo: 'SN-123' })).toEqual([]);
    expect(await codigos({ codigo: 'outro-1' })).toEqual([b.codigo]);
    await db.update(itensDevolucao).set({ serial: 'SN-DUP' }).where(eq(itensDevolucao.devolucaoId, a.id));
    const r = await buscarDevolucoes(db, { codigo: 'sn-dup' });
    expect(r.total).toBe(1);
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([a.codigo]);
  });

  it('(extra) Período: pela data de cadastro, no horário de Brasília', async () => {
    await db
      .update(devolucoes)
      .set({ criadaEm: new Date('2026-11-01T02:00:00Z') })
      .where(eq(devolucoes.id, a.id)); // 31/10 23:00
    await db
      .update(devolucoes)
      .set({ criadaEm: new Date('2026-11-01T12:00:00Z') })
      .where(eq(devolucoes.id, b.id));
    await db
      .update(devolucoes)
      .set({ criadaEm: new Date('2026-11-03T12:00:00Z') })
      .where(eq(devolucoes.id, c.id));
    expect(await codigos({ de: '2026-11-01', ate: '2026-11-01' })).toEqual([b.codigo]);
    expect(await codigos({ de: '2026-10-31', ate: '2026-10-31' })).toEqual([a.codigo]);
    expect(await codigos({ de: '2026-11-01' })).toEqual([b.codigo, c.codigo]);
  });

  it('os filtros combinam com a lista de status da etapa', async () => {
    expect(await codigos({ canal: 'MAGALU' }, { status: ['PENDENTE_CHEGADA'] })).toEqual([]);
    expect(await codigos({}, { status: ['PENDENTE_CHEGADA'] })).toEqual([a.codigo, b.codigo]);
    expect((await buscarDevolucoes(db, {}, { status: [] })).total).toBe(0);
  });

  it('o resumo do cartão traz o produto principal, as unidades e os selos; "Entregue (ML)" vai para o topo', async () => {
    await db.update(devolucoes).set({ canal: 'MERCADO_LIVRE', entregueSegundoCanalEm: new Date() }).where(eq(devolucoes.id, a.id));
    const { devolucoes: lista } = await buscarDevolucoes(db, {}, { status: ['PENDENTE_CHEGADA'] });
    expect(lista.map((d) => d.codigo)).toEqual([a.codigo, b.codigo]);
    expect(lista[0]).toMatchObject({
      produto: 'Fone Bluetooth',
      unidades: 2,
      pedidos: ['SHP-100'],
      selos: [{ texto: 'Entregue (ML)', tom: 'atencao' }],
    });
    expect(lista[1]).toMatchObject({
      produto: 'OUTRO-1',
      unidades: 1,
      selos: [],
    });
  });

  it('% e _ digitados valem como texto, não como curinga do LIKE', async () => {
    expect(await codigos({ rastreio: '%' })).toEqual([]);
    expect(await codigos({ rastreio: 'BR_11' })).toEqual([]);
    expect(await codigos({ pedido: '%' })).toEqual([]);
    expect(await codigos({ fornecedor: '%' })).toEqual([]);
  });

  it('pagina', async () => {
    const r = await buscarDevolucoes(db, {}, { porPagina: 2, pagina: 2 });
    expect(r.total).toBe(3);
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([a.codigo]);
  });

  it('ordem de chegada: quem chegou primeiro vem primeiro', async () => {
    await db
      .update(devolucoes)
      .set({ recebidaEm: new Date('2026-11-12T15:00:00Z') })
      .where(eq(devolucoes.id, a.id));
    await db
      .update(devolucoes)
      .set({ recebidaEm: new Date('2026-11-12T13:00:00Z') })
      .where(eq(devolucoes.id, b.id));
    const r = await buscarDevolucoes(db, {}, { ordem: 'chegada' });
    expect(r.devolucoes.map((d) => d.codigo)).toEqual([b.codigo, a.codigo, c.codigo]);
  });
});

describe('Código de Barras: EAN lido na conferência', () => {
  it('acha pelo ean_lido da unidade, sem diferenciar maiúsculas', async () => {
    const [item] = await db.select({ id: itensDevolucao.id }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, c.id));
    await db.update(itensDevolucao).set({ eanLido: '7899999999993' }).where(eq(itensDevolucao.id, item.id));
    expect(await codigos({ codigo: '7899999999993' })).toEqual([c.codigo]);
    await db.update(itensDevolucao).set({ eanLido: 'INT-ABC' }).where(eq(itensDevolucao.id, item.id));
    expect(await codigos({ codigo: 'int-abc' })).toEqual([c.codigo]);
  });
});
