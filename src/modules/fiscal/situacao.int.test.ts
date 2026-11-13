import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { referenciaDaNota } from './dominio';
import { notaPertenceADevolucao, obterSituacaoFiscal } from './situacao';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T13:00:00Z');
const HORA = 60 * 60 * 1000;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  await configurarFiscalTeste(db, gestor);
});
afterAll(async () => {
  await sql.end();
});

describe('obterSituacaoFiscal (Seção Fiscal)', () => {
  it('junta a NF de venda e o casamento das unidades, com as opções e as vagas que sobram', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }, { sku: 'SEM-PAR', destino: 'PROBLEMA' }] });
    const { notaVendaId, chave } = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01', quantidade: 2, descricao: 'Fone' }] });
    const s = await obterSituacaoFiscal(db, dev.id, AGORA);
    expect(s.notaAtiva).toBeNull();
    expect(s.anteriores).toEqual([]);
    expect(s.canalMercadoLivre).toBe(false);
    expect(s.notasVenda).toEqual([{ id: notaVendaId, chave, origem: 'XML anexado', emitidaEm: '20/10/2026 10:00', uf: 'SP', itens: ['FONE-01 × 2'] }]);
    expect(s.unidades).toEqual([
      {
        itemId: dev.itens[0].id,
        titulo: 'Unidade 1 · FONE-01',
        rotuloCurto: 'unidade 1',
        destino: 'Estoque Bom',
        casamento: 'Casado pelo SKU: NF 101 · item 1 · FONE-01 · Fone',
        valorAtual: `${notaVendaId}:1`,
        precisaEscolher: false,
        escolhida: false,
      },
      {
        itemId: dev.itens[1].id,
        titulo: 'Unidade 2 · SEM-PAR',
        rotuloCurto: 'unidade 2',
        destino: 'Estoque Problema',
        casamento: 'Sem item da NF de venda: escolha abaixo',
        valorAtual: '',
        precisaEscolher: true,
        escolhida: false,
      },
    ]);
    expect(s.opcoes).toEqual([{ valor: `${notaVendaId}:1`, rotulo: 'NF 101 · item 1 · FONE-01 · Fone (1 de 2 livres)' }]);
  });

  it('NF autorizada: prazo de cancelamento, aviso de série e, depois de 24 h, só a orientação', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ destino: 'BOM' }] });
    const id = randomUUID();
    await db.insert(notasFiscais).values({
      id,
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      referenciaEmissor: referenciaDaNota(id),
      situacao: 'AUTORIZADA',
      numero: '55',
      serie: '3',
      chave: '35261011444777000161550010000001011000001012',
      autorizadaEm: AGORA,
      xmlCaminho: `nfe/2026/11/${id}.xml`,
      danfeCaminho: `nfe/2026/11/${id}-danfe.pdf`,
    });
    const s = await obterSituacaoFiscal(db, dev.id, new Date(AGORA.getTime() + HORA));
    expect(s.notaAtiva).toMatchObject({
      id,
      situacao: 'AUTORIZADA',
      selo: 'NF autorizada',
      tom: 'bom',
      homologacao: true,
      numero: '55',
      autorizadaEm: '12/11/2026 10:00',
      cancelavelAte: '13/11/2026 10:00',
      podeCancelar: true,
      prazoEncerrado: false,
      avisoSerie: 'A SEFAZ devolveu a série 3, mas a configurada é 1: confira a série da empresa na Focus NFe.',
    });
    const depois = await obterSituacaoFiscal(db, dev.id, new Date(AGORA.getTime() + 25 * HORA));
    expect(depois.notaAtiva).toMatchObject({ podeCancelar: false, prazoEncerrado: true });
    expect(await notaPertenceADevolucao(db, id, dev.id)).toBe(true);
    expect(await notaPertenceADevolucao(db, id, randomUUID())).toBe(false);
  });
});
