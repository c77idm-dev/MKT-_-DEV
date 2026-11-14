import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoEmConferencia } from '../../../tests/helpers/fabricas-conferencia';
import { registrarEan, salvarItem } from './itens';
import type { EntradaItem } from './regras';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let esperadoId: string;
let outroId: string;

const VAZIA: EntradaItem = { serial: '', loteFabricacao: '', validade: '', decisao: null, motivo: null, observacao: '' };

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  esperadoId = await criarProdutoTeste(db, { sku: 'FONE-01', ean: '0036000291452', descricao: 'Fone Bluetooth' });
  outroId = await criarProdutoTeste(db, { sku: 'CABO-02', ean: '7891000000014', descricao: 'Cabo USB-C' });
});
afterAll(async () => {
  await sql.end();
});

async function item(id: string) {
  const [i] = await db
    .select({
      serial: itensDevolucao.serial,
      lote: itensDevolucao.loteFabricacao,
      validade: itensDevolucao.validade,
      destino: itensDevolucao.destino,
      motivo: itensDevolucao.motivo,
      observacao: itensDevolucao.observacao,
      eanLido: itensDevolucao.eanLido,
      produtoRecebidoId: itensDevolucao.produtoRecebidoId,
    })
    .from(itensDevolucao)
    .where(eq(itensDevolucao.id, id));
  return i;
}

describe('salvarItem', () => {
  it('grava S/N, lote, validade, destino, motivo e observação', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await salvarItem(db, d.id, d.itens[0], { serial: 'SN-9', loteFabricacao: 'L1', validade: '12/2027', decisao: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'tela trincada' }, operador);
    expect(await item(d.itens[0])).toMatchObject({ serial: 'SN-9', lote: 'L1', validade: '12/2027', destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'tela trincada' });
    await salvarItem(db, d.id, d.itens[0], { ...VAZIA, decisao: 'AUSENTE' }, operador);
    expect(await item(d.itens[0])).toMatchObject({ serial: null, destino: null, motivo: 'AUSENTE' });
  });

  it('recusa o que é inválido, a unidade de outra devolução e quem não está com a trava', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    const outraDevolucao = await criarDevolucaoEmConferencia(db, operador);
    await expect(salvarItem(db, d.id, d.itens[0], { ...VAZIA, decisao: 'PROBLEMA' }, operador)).rejects.toThrow('Escolha o motivo do Estoque Problema.');
    await expect(salvarItem(db, d.id, outraDevolucao.itens[0], VAZIA, operador)).rejects.toThrow('Unidade não encontrada nesta devolução.');
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    await expect(salvarItem(db, d.id, d.itens[0], VAZIA, outro)).rejects.toThrow('A conferência desta devolução não está aberta por você.');
  });
});

describe('registrarEan', () => {
  it('confere: o produto recebido é o esperado', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    expect(await registrarEan(db, d.id, d.itens[0], ' 036000291452 ', operador)).toEqual({
      situacao: 'confere',
      produtoRecebido: { sku: 'FONE-01', descricao: 'Fone Bluetooth' },
      sugerirMotivo: null,
    });
    expect(await item(d.itens[0])).toMatchObject({ eanLido: '036000291452', produtoRecebidoId: esperadoId });
  });

  it('diverge: grava o produto achado pelo EAN e sugere Divergente; EAN desconhecido deixa o produto vazio', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    expect(await registrarEan(db, d.id, d.itens[0], '7891000000014', operador)).toEqual({
      situacao: 'diverge',
      produtoRecebido: { sku: 'CABO-02', descricao: 'Cabo USB-C' },
      sugerirMotivo: 'DIVERGENTE',
    });
    expect((await item(d.itens[0])).produtoRecebidoId).toBe(outroId);
    expect((await registrarEan(db, d.id, d.itens[0], '7890000000001', operador)).produtoRecebido).toBeNull();
    expect((await item(d.itens[0])).produtoRecebidoId).toBeNull();
  });

  it('"não dá para ler": confirma o produto esperado sem EAN lido', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await registrarEan(db, d.id, d.itens[0], '7891000000014', operador);
    expect((await registrarEan(db, d.id, d.itens[0], null, operador)).situacao).toBe('confirmado');
    expect(await item(d.itens[0])).toMatchObject({ eanLido: null, produtoRecebidoId: esperadoId });
  });

  it('recusa código vazio', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(registrarEan(db, d.id, d.itens[0], '   ', operador)).rejects.toThrow('Leia ou digite o código de barras (até 50 caracteres).');
  });
});
