import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';

const mocks = vi.hoisted(() => ({
  procurar: vi.fn(),
  darChegada: vi.fn(),
  fichas: vi.fn(),
  revalidar: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidar }));
vi.mock('@/db', () => ({ obterDb: () => ({ db: true }) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: vi.fn(async () => ({ id: 'u1', perfil: 'OPERADOR' })) }));
vi.mock('@/modules/retiradas/retiradas', () => ({
  procurarPelaEtiquetaAmarela: mocks.procurar,
  darChegadaPelaEtiquetaAmarela: mocks.darChegada,
  alterarQuantidade: vi.fn(),
  biparProduto: vi.fn(),
  concluirRetirada: vi.fn(),
  removerItem: vi.fn(),
}));
vi.mock('@/modules/retiradas/consultas', () => ({ listarItensRetirada: vi.fn(async () => []) }));
vi.mock('@/modules/mercado-livre/ficha-venda', () => ({ fichasDasDevolucoes: mocks.fichas }));

import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { ErroRetirada } from '@/modules/retiradas/erros';
import { darChegadaEtiquetaAmarelaAcao, procurarEtiquetaAmarelaAcao } from './acoes';

const PEDIDO = '2000018992531744';

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return { devolucaoId, codigo, status: 'NO_CD_MARKETPLACE', conta: null, motivo: null, situacaoReclamacao: null, vendas: [], produtos: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('etiqueta amarela na Retirada do Full (extra, E27)', () => {
  it('procurar: achada pelo pedido, a ficha (ou a lista), sem registrar nada', async () => {
    mocks.procurar.mockResolvedValue({ tipo: 'escolher', codigoLido: PEDIDO, ids: ['a'], achadaPor: 'PEDIDO_ML' });
    mocks.fichas.mockResolvedValue([ficha('a', 'DEV-000071')]);
    expect(await procurarEtiquetaAmarelaAcao('r1', ` ${PEDIDO} `)).toMatchObject({ tipo: 'escolher', codigoLido: PEDIDO, fichas: [{ codigo: 'DEV-000071' }] });
    expect(mocks.procurar).toHaveBeenCalledWith({ db: true }, 'r1', ` ${PEDIDO} `, { id: 'u1', perfil: 'OPERADOR' });
    expect(mocks.darChegada).not.toHaveBeenCalled();
  });

  it('procurar: não achou, já chegou ou bloqueada, cada uma com a sua mensagem', async () => {
    mocks.procurar.mockResolvedValueOnce({ tipo: 'nao_encontrada', rastreio: PEDIDO });
    expect(await procurarEtiquetaAmarelaAcao('r1', PEDIDO)).toEqual({
      tipo: 'erro',
      mensagem: `Nenhuma devolução do ML com o pedido ${PEDIDO}. Confira o número na etiqueta amarela.`,
    });
    mocks.procurar.mockResolvedValueOnce({ tipo: 'ja_recebida', codigo: 'DEV-000071', status: 'AGUARDANDO_CONFERENCIA', recebidaEm: null, achadaPor: 'PEDIDO_ML' });
    expect(await procurarEtiquetaAmarelaAcao('r1', PEDIDO)).toEqual({
      tipo: 'aviso',
      titulo: 'Este pacote já chegou',
      mensagem: 'DEV-000071 já tinha chegado. Status: Aguardando conferência.',
      codigos: ['DEV-000071'],
    });
    mocks.procurar.mockResolvedValueOnce({ tipo: 'bloqueada', codigo: 'DEV-000071', status: 'EXTRAVIADA', achadaPor: 'PEDIDO_ML' });
    expect(await procurarEtiquetaAmarelaAcao('r1', PEDIDO)).toMatchObject({
      tipo: 'aviso',
      titulo: 'Fale com o Gestor',
      mensagem: 'DEV-000071 está extraviada. Separe o pacote e avise o Gestor.',
    });
  });

  it('"Dar chegada nesta devolução": registra pela retirada e avisa que não entra nos itens', async () => {
    mocks.darChegada.mockResolvedValue({
      tipo: 'recebidas',
      codigos: ['DEV-000071'],
      em: new Date('2026-11-24T10:30:00-03:00'),
      achadaPor: 'PEDIDO_ML',
      doArmazemML: ['DEV-000071'],
    });
    expect(await darChegadaEtiquetaAmarelaAcao('r1', 'a', PEDIDO)).toEqual({
      tipo: 'chegada',
      codigos: ['DEV-000071'],
      mensagem: 'DEV-000071 · voltou do armazém do ML (extra) · 24/11/2026 10:30',
    });
    expect(mocks.darChegada).toHaveBeenCalledWith({ db: true }, 'r1', { devolucaoId: 'a', codigoLido: PEDIDO }, { id: 'u1', perfil: 'OPERADOR' });
    expect(mocks.revalidar).toHaveBeenCalledWith('/fluxo');
  });

  it('erros de regra (da retirada ou da devolução) vão para a tela', async () => {
    mocks.darChegada.mockRejectedValueOnce(new ErroRetirada('Esta retirada já foi conferida.'));
    expect(await darChegadaEtiquetaAmarelaAcao('r1', 'a', PEDIDO)).toEqual({ tipo: 'erro', mensagem: 'Esta retirada já foi conferida.' });
    mocks.procurar.mockRejectedValueOnce(new ErroDevolucao('O número do pedido tem só algarismos.'));
    expect(await procurarEtiquetaAmarelaAcao('r1', 'AB')).toEqual({ tipo: 'erro', mensagem: 'O número do pedido tem só algarismos.' });
  });
});
