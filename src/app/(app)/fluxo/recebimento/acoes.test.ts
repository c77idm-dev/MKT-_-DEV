import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';

const mocks = vi.hoisted(() => ({
  receber: vi.fn(),
  darChegada: vi.fn(),
  fichas: vi.fn(),
  revalidar: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidar }));
vi.mock('@/db', () => ({ obterDb: () => ({ db: true }) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: vi.fn(async () => ({ id: 'u1', perfil: 'OPERADOR' })) }));
vi.mock('@/modules/devolucoes/recebimento', () => ({
  receberPorRastreio: mocks.receber,
  darChegadaPeloPedido: mocks.darChegada,
  criarNaoIdentificada: vi.fn(),
}));
vi.mock('@/modules/mercado-livre/ficha-venda', () => ({ fichasDasDevolucoes: mocks.fichas }));

import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { registrarChegadaAcao, type EstadoRecebimento } from './acoes';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };
const PEDIDO = '2000018992531744';

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return { devolucaoId, codigo, status: 'PENDENTE_CHEGADA', conta: null, motivo: null, situacaoReclamacao: null, vendas: [], produtos: [] };
}

function form(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registrarChegadaAcao pelo número do pedido (extra, E27)', () => {
  it('achada pelo pedido: mostra a ficha (ou a lista) e não registra nada', async () => {
    mocks.receber.mockResolvedValue({ tipo: 'escolher', codigoLido: PEDIDO, ids: ['a', 'b'], achadaPor: 'PEDIDO_ML' });
    mocks.fichas.mockResolvedValue([ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')]);
    const estado = await registrarChegadaAcao(INICIAL, form({ intencao: 'receber', rastreio: PEDIDO }));
    expect(mocks.fichas).toHaveBeenCalledWith({ db: true }, ['a', 'b']);
    expect(estado).toMatchObject({
      tipo: 'escolher',
      codigoLido: PEDIDO,
      fichas: [{ codigo: 'DEV-000001' }, { codigo: 'DEV-000002' }],
      nota: 'Achadas pelo número do pedido do ML (extra).',
    });
    expect(mocks.darChegada).not.toHaveBeenCalled();
    expect(mocks.revalidar).not.toHaveBeenCalled();
  });

  it('pela câmera, o mesmo pedido com a ficha aberta: a ficha fica (o mesmo estado, sem montar de novo)', async () => {
    const aberta: EstadoRecebimento = { tipo: 'escolher', codigoLido: PEDIDO, lidaEm: 1, fichas: [ficha('a', 'DEV-000001')], nota: 'n' };
    mocks.receber.mockResolvedValue({ tipo: 'escolher', codigoLido: PEDIDO.slice(1), ids: ['a'], achadaPor: 'PEDIDO_ML' });
    mocks.fichas.mockResolvedValue([ficha('a', 'DEV-000001')]);
    expect(await registrarChegadaAcao(aberta, form({ intencao: 'receber', rastreio: PEDIDO.slice(1), origem: 'camera' }))).toBe(aberta);
    // Pelo campo, a resposta é nova.
    const pelo = await registrarChegadaAcao(aberta, form({ intencao: 'receber', rastreio: PEDIDO.slice(1) }));
    expect(pelo).not.toBe(aberta);
    expect(pelo).toMatchObject({ tipo: 'escolher', codigoLido: PEDIDO.slice(1) });
  });

  it('nenhuma ficha (a devolução saiu do ML entre a busca e a ficha): pede para ler de novo', async () => {
    mocks.receber.mockResolvedValue({ tipo: 'escolher', codigoLido: PEDIDO, ids: ['a'], achadaPor: 'PEDIDO_ML' });
    mocks.fichas.mockResolvedValue([]);
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'receber', rastreio: PEDIDO }))).toEqual({
      tipo: 'erro',
      mensagem: 'A situação desta devolução mudou agora. Leia o pacote de novo.',
    });
  });

  it('"Dar chegada" registra só a devolução tocada, com o pedido lido; o cartão verde guarda as devoluções do pedido', async () => {
    const aberta: EstadoRecebimento = {
      tipo: 'escolher',
      codigoLido: PEDIDO,
      lidaEm: 1,
      fichas: [ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')],
      nota: 'n',
    };
    mocks.darChegada.mockResolvedValue({ tipo: 'recebidas', codigos: ['DEV-000002'], em: new Date('2026-11-24T10:30:00-03:00'), achadaPor: 'PEDIDO_ML', doArmazemML: ['DEV-000002'] });
    const estado = await registrarChegadaAcao(aberta, form({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: PEDIDO }));
    expect(mocks.darChegada).toHaveBeenCalledWith({ db: true }, { devolucaoId: 'b', codigoLido: PEDIDO }, { id: 'u1', perfil: 'OPERADOR' });
    expect(mocks.receber).not.toHaveBeenCalled();
    expect(estado).toEqual({
      tipo: 'sucesso',
      titulo: 'Chegada registrada',
      mensagem: 'DEV-000002 · voltou do armazém do ML (extra) · 24/11/2026 10:30',
      codigos: ['DEV-000002'],
      nota: 'Achada pelo número do pedido do ML (extra).',
      idsDoPedido: ['a', 'b'],
    });
    expect(mocks.revalidar).toHaveBeenCalledWith('/fluxo');
  });

  it('"Dar chegada" de novo (outro celular já deu): "Este pacote já chegou"; cancelada: "Fale com o Gestor"', async () => {
    mocks.darChegada.mockResolvedValueOnce({ tipo: 'ja_recebida', codigo: 'DEV-000002', status: 'AGUARDANDO_CONFERENCIA', recebidaEm: null, achadaPor: 'PEDIDO_ML' });
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: PEDIDO }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Este pacote já chegou',
      codigos: ['DEV-000002'],
    });
    mocks.darChegada.mockResolvedValueOnce({ tipo: 'bloqueada', codigo: 'DEV-000002', status: 'CANCELADA', achadaPor: 'PEDIDO_ML' });
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: PEDIDO }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Fale com o Gestor',
      mensagem: 'DEV-000002 está cancelada. Separe o pacote e avise o Gestor.',
    });
  });

  it('"Dar chegada" com erro de regra: a mensagem vai para a tela', async () => {
    mocks.darChegada.mockRejectedValue(new ErroDevolucao('Esta devolução não é deste pedido. Leia o número do pedido de novo.'));
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'x', codigoLido: PEDIDO }))).toEqual({
      tipo: 'erro',
      mensagem: 'Esta devolução não é deste pedido. Leia o número do pedido de novo.',
    });
  });
});
