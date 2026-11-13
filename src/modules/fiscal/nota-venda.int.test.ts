import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import type { MarketplaceConnector } from '@/conectores/marketplace/tipos';
import { devolucoes, notasFiscais, notasVenda } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { xmlNotaVendaTeste } from '../../../tests/helpers/xml-nfe';
import { referenciaDaNota } from './dominio';
import { buscarNotaVendaNoCanal, registrarNotaVenda, removerNotaVenda } from './nota-venda';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;

/** Conector do ML de mentira: só `obterXmlNotaVenda` importa aqui (contrato §5.8). */
function conectorComNotas(xmlPorPedido: Record<string, string>): MarketplaceConnector {
  return {
    canal: 'MERCADO_LIVRE',
    listarAtualizadasDesde: () => {
      throw new Error('não usado neste teste');
    },
    obter: async () => {
      throw new Error('não usado neste teste');
    },
    enviarResultadoConferencia: async () => {
      throw new Error('não usado neste teste');
    },
    obterXmlNotaVenda: async (pedido) => xmlPorPedido[pedido] ?? null,
  };
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
});
afterEach(() => {
  definirConectorParaTestes('MERCADO_LIVRE', null);
});
afterAll(async () => {
  await sql.end();
});

describe('NF de venda (spec §7.5, contrato §5.8)', () => {
  it('anexa: guarda o XML no armazenamento, grava destinatário e itens e registra no histórico', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    const { xml, chave } = xmlNotaVendaTeste({ itens: [{ codigo: 'FONE-01' }] });
    const r = await registrarNotaVenda(db, dev.id, xml, 'ANEXO', fiscal);
    expect(r).toEqual({ notaVendaId: expect.any(String), chave });

    const [nota] = await db.select().from(notasVenda).where(eq(notasVenda.id, r.notaVendaId));
    expect(nota).toMatchObject({
      devolucaoId: dev.id,
      chave,
      origem: 'ANEXO',
      xmlCaminho: `notas-venda/${dev.id}/${r.notaVendaId}.xml`,
      anexadaPor: fiscal.id,
      destinatario: { cpf: '52998224725', uf: 'SP' },
    });
    expect(nota.itens).toHaveLength(1);
    expect(await obterArmazenamento().existe(nota.xmlCaminho)).toBe(true);
    expect(await listarEventos(db, 'devolucao', dev.id)).toContainEqual(
      expect.objectContaining({ acao: 'nota_venda_anexada', usuarioNome: fiscal.nome, dados: { notaVendaId: r.notaVendaId, chave } }),
    );
  });

  it('recusa: outro CNPJ, anexo repetido, Operador, NF de devolução em andamento e devolução concluída', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'A', destino: 'BOM' }] });
    const deOutro = xmlNotaVendaTeste({ cnpjEmitente: '19131243000197', itens: [{ codigo: 'A' }] }).xml;
    await expect(registrarNotaVenda(db, dev.id, deOutro, 'ANEXO', fiscal)).rejects.toThrow(
      'Esta NF de venda foi emitida por outro CNPJ (19.131.243/0001-97): anexe a nota emitida pela empresa.',
    );
    const boa = xmlNotaVendaTeste({ itens: [{ codigo: 'A' }] }).xml;
    await registrarNotaVenda(db, dev.id, boa, 'ANEXO', fiscal);
    await expect(registrarNotaVenda(db, dev.id, boa, 'ANEXO', fiscal)).rejects.toThrow('Esta NF de venda já está anexada a esta devolução.');
    const outra = xmlNotaVendaTeste({ numero: 102, itens: [{ codigo: 'A' }] }).xml;
    await expect(registrarNotaVenda(db, dev.id, outra, 'ANEXO', operador)).rejects.toThrow('Só o Fiscal ou o Gestor mexem na NF de venda.');

    const id = randomUUID();
    await db.insert(notasFiscais).values({ id, tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id, ambiente: 'HOMOLOGACAO', referenciaEmissor: referenciaDaNota(id) });
    await expect(registrarNotaVenda(db, dev.id, outra, 'ANEXO', fiscal)).rejects.toThrow(
      'Esta devolução já tem NF de devolução em processamento ou autorizada.',
    );
    await db.update(devolucoes).set({ status: 'CONCLUIDA' }).where(eq(devolucoes.id, dev.id));
    await expect(registrarNotaVenda(db, dev.id, outra, 'ANEXO', fiscal)).rejects.toThrow('A devolução está concluída: a NF de venda não muda mais.');
  });

  it('busca no Mercado Livre pelo conector; sem conector (até a Fase 3) não consulta; não duplica', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
      canal: 'MERCADO_LIVRE',
      pedido: 'ML-2000001',
      unidades: [{ sku: 'FONE-01', destino: 'BOM' }],
    });
    expect(await buscarNotaVendaNoCanal(db, dev.id, fiscal)).toEqual({ consultou: false, encontradas: 0 });

    const { xml, chave } = xmlNotaVendaTeste({ itens: [{ codigo: 'FONE-01' }] });
    definirConectorParaTestes('MERCADO_LIVRE', conectorComNotas({ 'ML-2000001': xml }));
    expect(await buscarNotaVendaNoCanal(db, dev.id, fiscal)).toEqual({ consultou: true, encontradas: 1 });
    const [nota] = await db.select().from(notasVenda).where(eq(notasVenda.devolucaoId, dev.id));
    expect(nota).toMatchObject({ chave, origem: 'MERCADO_LIVRE' });
    expect(await buscarNotaVendaNoCanal(db, dev.id, fiscal)).toEqual({ consultou: true, encontradas: 0 });
    expect((await listarEventos(db, 'devolucao', dev.id)).map((e) => e.acao)).toContain('nota_venda_obtida_ml');

    const shopee = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    expect(await buscarNotaVendaNoCanal(db, shopee.id, fiscal)).toEqual({ consultou: false, encontradas: 0 });
  });

  it('remove a NF de venda anexada por engano e apaga o arquivo', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'A', destino: 'BOM' }] });
    const r = await registrarNotaVenda(db, dev.id, xmlNotaVendaTeste({ itens: [{ codigo: 'A' }] }).xml, 'ANEXO', fiscal);
    const caminho = `notas-venda/${dev.id}/${r.notaVendaId}.xml`;
    await removerNotaVenda(db, dev.id, r.notaVendaId, fiscal);
    expect(await db.select().from(notasVenda).where(eq(notasVenda.devolucaoId, dev.id))).toEqual([]);
    expect(await obterArmazenamento().existe(caminho)).toBe(false);
    expect((await listarEventos(db, 'devolucao', dev.id)).at(-1)).toMatchObject({ acao: 'nota_venda_removida', usuarioNome: fiscal.nome });
    await expect(removerNotaVenda(db, dev.id, r.notaVendaId, fiscal)).rejects.toThrow('NF de venda não encontrada.');
  });
});
