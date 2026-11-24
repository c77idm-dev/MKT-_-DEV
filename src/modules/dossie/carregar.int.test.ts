import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada } from '../../../tests/helpers/fabricas-conferencia';
import { devolucaoComProvasTeste, EAN_DOSSIE } from '../../../tests/helpers/fabricas-dossie-banco';
import { carregarDossie } from './carregar';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-19T18:30:00Z');
const GERACAO = { em: AGORA };

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('carregarDossie (extra)', () => {
  it('código desconhecido: null', async () => {
    expect(await carregarDossie(db, 'DEV-999999', GERACAO)).toBeNull();
  });

  it('junta o detalhe, a conferência, o ML e as evidências, num carregamento só (sem hashes, histórico nem nomes: E28)', async () => {
    const p = await devolucaoComProvasTeste(db);
    const d = await carregarDossie(db, p.codigo.toLowerCase(), GERACAO);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({
      id: p.id,
      codigo: p.codigo,
      canal: 'MERCADO_LIVRE',
      empresa: 'Loja Exemplo Ltda',
      pedidos: [p.pedido],
      reclamacaoId: p.reclamacaoId,
      devolucaoExternaId: null,
      contaML: 'Loja Dossiê',
      motivoReclamacaoML: { id: 'PDD9949', texto: 'Chegou com defeito' },
      rastreio: p.rastreio,
      transportadora: 'Correios',
      motivoCliente: 'Produto não funciona',
      geradoEm: AGORA,
    });
    expect(d!.recebidaEm).toBeInstanceOf(Date);
    expect(d!.conferenciaIniciadaEm).toBeInstanceOf(Date);
    expect(d!.conferidaEm).toBeInstanceOf(Date);
    expect(d!.unidades).toEqual([
      expect.objectContaining({
        id: p.itens[0],
        unidade: 1,
        sku: p.sku,
        status: 'AGUARDANDO_NF',
        descricao: 'Fone Bluetooth Ação',
        eanEsperado: EAN_DOSSIE,
        eanLido: EAN_DOSSIE,
        divergente: false,
        serial: 'SN-ABC-1',
        loteFabricacao: 'L2026',
        validade: '12/2027',
        destino: 'PROBLEMA',
        motivo: 'AVARIADO',
        observacao: 'Caixa amassada e tela trincada.',
      }),
      expect.objectContaining({ id: p.itens[1], unidade: 2, status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }),
    ]);
    // A foto do anúncio do ML saiu do dossiê (E28).
    for (const u of d!.unidades) expect(u).not.toHaveProperty('fotoUrl');
    expect(d!.evidencias).toHaveLength(6);
    const f3 = d!.evidencias.find((e) => e.id === p.evidencias.f3.id)!;
    expect(f3).toEqual({
      id: p.evidencias.f3.id,
      tipo: 'FOTO_3_PRODUTO',
      itemId: p.itens[0],
      situacao: 'PRONTA',
      tipoConteudo: 'image/jpeg',
      caminho: p.evidencias.f3.caminho,
      provedor: 'disco',
      enviadoEm: expect.any(Date),
    });
    // Nenhum nome de pessoa nos dados do PDF (E28): o operador recebeu, conferiu e enviou as fotos.
    expect(JSON.stringify(d)).not.toContain(p.operador.nome);
  });

  it('nenhum dado pessoal do comprador: só os campos previstos', async () => {
    const p = await devolucaoComProvasTeste(db);
    const d = await carregarDossie(db, p.codigo, GERACAO);
    expect(Object.keys(d!).sort()).toEqual(
      [
        'id', 'codigo', 'canal', 'empresa', 'pedidos', 'reclamacaoId', 'devolucaoExternaId', 'contaML', 'motivoReclamacaoML',
        'rastreio', 'transportadora', 'motivoCliente', 'recebidaEm', 'conferenciaIniciadaEm', 'conferidaEm', 'unidades',
        'evidencias', 'geradoEm',
      ].sort(),
    );
  });

  it('em conferência: conferidaEm vazio (a rota responde 409)', async () => {
    const p = await devolucaoComProvasTeste(db, { concluir: false });
    const d = await carregarDossie(db, p.codigo, GERACAO);
    expect(d!.conferidaEm).toBeNull();
    expect(d!.conferenciaIniciadaEm).toBeInstanceOf(Date);
  });

  it('fora do ML: sem reclamação, conta nem motivo do ML; sem razão social, empresa vazia', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const c = await criarDevolucaoChegada(db, operador);
    const d = await carregarDossie(db, c.codigo, GERACAO);
    expect(d).toMatchObject({ canal: 'SHOPEE', reclamacaoId: null, contaML: null, motivoReclamacaoML: null, empresa: null, conferidaEm: null, evidencias: [] });
    expect(d!.unidades).toHaveLength(1);
  });
});
