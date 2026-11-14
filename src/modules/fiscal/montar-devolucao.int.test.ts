import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasVenda } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { escolherItemNotaVenda } from './escolha';
import { montarNotaDevolucao } from './montar-devolucao';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
});
afterAll(async () => {
  await sql.end();
});

describe('montarNotaDevolucao (banco)', () => {
  it('operação pela UF do comprador (RJ → fora do estado, CFOP 2202); AUSENTE fica fora; S/N nas informações', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      unidades: [
        { sku: 'FONE-01', destino: 'BOM', serial: 'SN-1' },
        { sku: 'FONE-01', destino: 'PROBLEMA' },
        { sku: 'CABO-02', destino: 'AUSENTE' },
      ],
    });
    const { chave } = await inserirNotaVendaTeste(db, dev.id, {
      destinatario: { uf: 'RJ', cidade: 'Rio de Janeiro' },
      itens: [{ codigo: 'FONE-01', quantidade: 2, valorUnitario: 80 }],
    });
    const nota = await montarNotaDevolucao(db, dev.id, 'ref1');
    expect(nota).toMatchObject({
      referencia: 'ref1',
      operacao: 'FORA_ESTADO',
      chavesReferenciadas: [chave],
      destinatario: { uf: 'RJ' },
      itens: [{ codigo: 'FONE-01', quantidade: 2, cfop: '2202', valorUnitario: 80 }],
    });
    expect(nota.informacoesComplementares).toBe(`Devolucao referente a NF-e ${chave}. Devolucao ${dev.codigo}.`);
  });

  it('escolha do Fiscal (D14): liga a unidade sem par, respeita a quantidade, desfaz e fica no histórico', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'SKU-X', destino: 'BOM' }, { sku: 'SKU-Y', destino: 'BOM' }] });
    const { notaVendaId } = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'OUTRO', quantidade: 1 }] });
    await expect(montarNotaDevolucao(db, dev.id, 'r')).rejects.toThrow('Unidade 1 (SKU SKU-X), Unidade 2 (SKU SKU-Y): escolha o item da NF de venda.');

    const [x, y] = dev.itens;
    await escolherItemNotaVenda(db, dev.id, x.id, { notaVendaId, numeroItem: 1 }, fiscal);
    await expect(escolherItemNotaVenda(db, dev.id, y.id, { notaVendaId, numeroItem: 1 }, fiscal)).rejects.toThrow(
      'O item 1 da NF de venda (OUTRO) já tem todas as unidades ligadas (1).',
    );
    await expect(montarNotaDevolucao(db, dev.id, 'r')).rejects.toThrow('Unidade 2 (SKU SKU-Y): escolha o item da NF de venda.');

    await escolherItemNotaVenda(db, dev.id, x.id, null, fiscal);
    await escolherItemNotaVenda(db, dev.id, y.id, { notaVendaId, numeroItem: 1 }, fiscal);
    const [venda] = await db.select().from(notasVenda).where(eq(notasVenda.id, notaVendaId));
    expect(venda.itens[0].itensDevolucaoIds).toEqual([y.id]);
    expect((await listarEventos(db, 'devolucao', dev.id)).filter((e) => e.acao === 'nf_item_escolhido')).toHaveLength(3);
  });

  it('a escolha é só do Fiscal e do Gestor, de item que existe, de unidade que aguarda NF', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'SKU-X', destino: 'BOM' }, { sku: 'SKU-Z', destino: 'AUSENTE' }] });
    const { notaVendaId } = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'OUTRO' }] });
    const [x, ausente] = dev.itens;
    await expect(escolherItemNotaVenda(db, dev.id, x.id, { notaVendaId, numeroItem: 1 }, operador)).rejects.toThrow(
      'Só o Fiscal ou o Gestor escolhem o item da NF de venda.',
    );
    await expect(escolherItemNotaVenda(db, dev.id, x.id, { notaVendaId, numeroItem: 9 }, fiscal)).rejects.toThrow('Item da NF de venda não encontrado.');
    await expect(escolherItemNotaVenda(db, dev.id, ausente.id, { notaVendaId, numeroItem: 1 }, fiscal)).rejects.toThrow(
      'Unidade não encontrada ou fora de Aguardando NF.',
    );
  });
});
