import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { lotes, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { carregarListaConsolidada } from './lista-consolidada';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-14T13:05:00Z');
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('carregarListaConsolidada (spec §6.5)', () => {
  it('fornecedor, NF de remessa, unidades com S/N, motivo e nº da devolução', async () => {
    const f = await criarFornecedorCompletoTeste(db, { razaoSocial: 'Peças Brasil Ltda' });
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ destino: 'PROBLEMA', motivo: 'AVARIADO', serial: 'SN-1', produtoId: p.id }, { destino: 'PROBLEMA', motivo: 'COM_DEFEITO', serial: null, produtoId: p.id }],
    });
    const l = await criarLoteTeste(db, { fornecedorId: f.id, status: 'NF_EMITIDA', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id) });
    const [nota] = await db
      .insert(notasFiscais)
      .values({ tipo: 'REMESSA_CONSERTO', loteId: l.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: 'ref1', situacao: 'AUTORIZADA', numero: '123', serie: '1', chave: '35261111222333000181550010000001231123456783', autorizadaEm: new Date('2026-11-14T13:00:00Z') })
      .returning();
    await db.update(lotes).set({ notaFiscalId: nota.id }).where(eq(lotes.id, l.id));

    const lista = await carregarListaConsolidada(db, l.codigo, AGORA);
    expect(lista).toEqual({
      lote: { codigo: l.codigo, tipo: 'Conserto' },
      fornecedor: { razaoSocial: 'Peças Brasil Ltda', cnpj: expect.stringMatching(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/), contatoSac: 'SAC Teste', emailSac: 'sac@fornecedor.teste' },
      nota: { numero: '123', serie: '1', chave: '35261111222333000181550010000001231123456783', autorizadaEm: '14/11/2026 10:00' },
      geradaEm: '14/11/2026 10:05',
      linhas: [
        { devolucao: dev.codigo, unidade: 1, sku: p.sku, descricao: 'Fone Bluetooth de teste', serial: 'SN-1', motivo: 'Avariado', observacao: '' },
        { devolucao: dev.codigo, unidade: 2, sku: p.sku, descricao: 'Fone Bluetooth de teste', serial: '—', motivo: 'Com defeito', observacao: '' },
      ],
    });
  });

  it('o SKU da lista e o do produto recebido (o da NF), nao o da venda', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const p = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: f.cnpj });
    const dev = await criarDevolucaoComProblemasTeste(db, gestor, {
      unidades: [{ destino: 'PROBLEMA', motivo: 'AVARIADO', serial: 'SN-1', sku: 'VENDIDO-1', produtoId: p.id }],
    });
    const l = await criarLoteTeste(db, { fornecedorId: f.id, status: 'NF_EMITIDA', tipo: 'CONSERTO', itemIds: dev.itens.map((i) => i.id) });
    const [nota] = await db
      .insert(notasFiscais)
      .values({ tipo: 'REMESSA_CONSERTO', loteId: l.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: 'ref2', situacao: 'AUTORIZADA', numero: '124', serie: '1', chave: '35261111222333000181550010000001241123456784', autorizadaEm: new Date('2026-11-14T13:00:00Z') })
      .returning();
    await db.update(lotes).set({ notaFiscalId: nota.id }).where(eq(lotes.id, l.id));
    const lista = await carregarListaConsolidada(db, l.codigo, AGORA);
    expect(lista?.linhas.map((x) => x.sku)).toEqual([p.sku]);
  });

  it('sem NF autorizada não há lista; lote que não existe devolve null', async () => {
    const f = await criarFornecedorCompletoTeste(db);
    const l = await criarLoteTeste(db, { fornecedorId: f.id, status: 'FECHADO' });
    await expect(carregarListaConsolidada(db, l.codigo, AGORA)).rejects.toThrow('A lista consolidada sai depois da NF de Remessa autorizada.');
    expect(await carregarListaConsolidada(db, 'LOT-999999', AGORA)).toBeNull();
  });
});
