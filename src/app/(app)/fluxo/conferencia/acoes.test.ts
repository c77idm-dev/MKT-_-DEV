import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';

const ordem: string[] = [];
const mocks = vi.hoisted(() => ({
  localizar: vi.fn(),
  iniciar: vi.fn(async () => undefined),
  fichas: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn((...a: unknown[]) => ordem.push(`revalidate:${a.join(',')}`)) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    ordem.push(`redirect:${url}`);
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: vi.fn(async () => ({ id: 'u1' })) }));
vi.mock('@/modules/conferencia/localizar', () => ({ localizarParaConferencia: mocks.localizar }));
vi.mock('@/modules/conferencia/trava', () => ({ iniciarConferencia: mocks.iniciar }));
vi.mock('@/modules/mercado-livre/ficha-venda', () => ({ fichasDasDevolucoes: mocks.fichas }));

import { ErroConferencia } from '@/modules/conferencia/erros';
import { abrirConferenciaAcao, type EstadoConferirPacote } from './acoes';

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return { devolucaoId, codigo, status: 'AGUARDANDO_CONFERENCIA', conta: null, motivo: null, situacaoReclamacao: null, temReclamacao: true, vendas: [], produtos: [] };
}

function form(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return dados;
}

beforeEach(() => {
  ordem.length = 0;
  vi.clearAllMocks();
  mocks.localizar.mockResolvedValue({ tipo: 'devolucao', id: 'd1', codigo: 'DEV-1' });
});

describe('abrirConferenciaAcao', () => {
  it('revalida a lista e o contador do fluxo antes de redirecionar para a conferência', async () => {
    await expect(abrirConferenciaAcao({ erros: [] }, form({ codigo: 'DEV-1' }))).rejects.toThrow('NEXT_REDIRECT');
    expect(ordem).toEqual(['revalidate:/fluxo,layout', 'redirect:/fluxo/devolucoes/DEV-1/conferencia']);
  });
});

describe('abrirConferenciaAcao pelo número do pedido do ML (extra, E27)', () => {
  it('achada pelo pedido: a ficha (ou a lista), sem abrir a conferência', async () => {
    mocks.localizar.mockResolvedValue({ tipo: 'pedido', codigoLido: '2000018992531744', ids: ['a', 'b'] });
    mocks.fichas.mockResolvedValue([ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')]);
    const estado = await abrirConferenciaAcao({ erros: [] }, form({ codigo: '2000018992531744' }));
    expect(mocks.fichas).toHaveBeenCalledWith({}, ['a', 'b']);
    expect(estado).toMatchObject({ erros: [], pedido: { codigoLido: '2000018992531744', fichas: [{ codigo: 'DEV-000001' }, { codigo: 'DEV-000002' }] } });
    expect(mocks.iniciar).not.toHaveBeenCalled();
    expect(ordem).toEqual([]);
  });

  it('"Iniciar conferência" na ficha abre a conferência da devolução tocada', async () => {
    const anterior: EstadoConferirPacote = { erros: [], pedido: { codigoLido: '2000018992531744', lidaEm: 1, fichas: [ficha('d1', 'DEV-1')] } };
    await expect(abrirConferenciaAcao(anterior, form({ codigo: 'DEV-1', origem: 'ficha' }))).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.iniciar).toHaveBeenCalledWith({}, 'd1', { id: 'u1' });
    expect(ordem).toEqual(['revalidate:/fluxo,layout', 'redirect:/fluxo/devolucoes/DEV-1/conferencia']);
  });

  it('erro ao iniciar pela ficha: a mensagem aparece e a ficha fica; pelo campo, a ficha sai', async () => {
    const pedido = { codigoLido: '2000018992531744', lidaEm: 1, fichas: [ficha('d1', 'DEV-1')] };
    mocks.iniciar.mockRejectedValueOnce(new ErroConferencia('DEV-1 está em conferência por Ana.'));
    expect(await abrirConferenciaAcao({ erros: [], pedido }, form({ codigo: 'DEV-1', origem: 'ficha' }))).toEqual({
      erros: ['DEV-1 está em conferência por Ana.'],
      pedido,
    });
    mocks.localizar.mockRejectedValueOnce(new ErroConferencia('Nada.'));
    expect(await abrirConferenciaAcao({ erros: [], pedido }, form({ codigo: 'XYZ' }))).toEqual({ erros: ['Nada.'] });
  });

  it('nenhuma ficha (a devolução mudou entre a busca e a ficha): pede para ler de novo', async () => {
    mocks.localizar.mockResolvedValue({ tipo: 'pedido', codigoLido: '2000018992531744', ids: ['a'] });
    mocks.fichas.mockResolvedValue([]);
    expect(await abrirConferenciaAcao({ erros: [] }, form({ codigo: '2000018992531744' }))).toEqual({
      erros: ['A situação desta devolução mudou agora. Leia o pacote de novo.'],
    });
  });
});
