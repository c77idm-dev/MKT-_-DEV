import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  revalidar: vi.fn(),
  redirecionar: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  reabrir: vi.fn(),
  apagar: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidar }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirecionar }));
vi.mock('@/db', () => ({ obterDb: () => ({ db: true }) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: mocks.exigir }));
vi.mock('@/modules/retiradas/correcoes', () => ({ reabrirRetirada: mocks.reabrir, apagarRetirada: mocks.apagar, restaurarRetirada: vi.fn() }));
vi.mock('@/modules/retiradas/retiradas', () => ({}));
vi.mock('@/modules/retiradas/consultas', () => ({ listarItensRetirada: vi.fn() }));
vi.mock('@/modules/mercado-livre/ficha-venda', () => ({ fichasDasDevolucoes: vi.fn() }));

import { ErroRetirada } from '@/modules/retiradas/erros';
import { apagarRetiradaAcao, reabrirRetiradaAcao } from './acoes';

const GESTOR = { id: 'g1', perfil: 'GESTOR' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigir.mockResolvedValue(GESTOR);
});

describe('Corrigir (Gestor) na Retirada do Full (E29)', () => {
  it('as duas ações exigem administrar; sem ela, o serviço nem é chamado', async () => {
    mocks.exigir.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(reabrirRetiradaAcao('r1', 'RF-000001')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(apagarRetiradaAcao('r1', 'RF-000001')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.exigir.mock.calls.map((c) => c[0])).toEqual(['administrar', 'administrar']);
    expect(mocks.reabrir).not.toHaveBeenCalled();
    expect(mocks.apagar).not.toHaveBeenCalled();
  });

  it('código fora do formato: retirada não encontrada', async () => {
    expect(await reabrirRetiradaAcao('r1', '../x')).toEqual({ erros: ['Retirada não encontrada.'] });
    expect(mocks.reabrir).not.toHaveBeenCalled();
  });

  it('reabrir volta à retirada com a confirmação; a recusa do servidor volta como erro', async () => {
    await expect(reabrirRetiradaAcao('r1', 'RF-000001')).rejects.toThrow('REDIRECT /fluxo/retiradas-full/RF-000001?ok=reaberta');
    expect(mocks.reabrir).toHaveBeenCalledWith({ db: true }, 'r1', GESTOR);
    expect(mocks.revalidar).toHaveBeenCalledWith('/fluxo', 'layout');
    mocks.reabrir.mockRejectedValue(new ErroRetirada('Esta retirada já está Aberta.'));
    expect(await reabrirRetiradaAcao('r1', 'RF-000001')).toEqual({ erros: ['Esta retirada já está Aberta.'] });
  });

  it('apagar vai para a lista das retiradas com o aviso de Apagadas', async () => {
    await expect(apagarRetiradaAcao('r1', 'RF-000001')).rejects.toThrow('REDIRECT /fluxo/retiradas-full?apagada=RF-000001');
    expect(mocks.apagar).toHaveBeenCalledWith({ db: true }, 'r1', GESTOR);
    mocks.apagar.mockRejectedValue(new ErroRetirada('Esta retirada já está apagada.'));
    expect(await apagarRetiradaAcao('r1', 'RF-000001')).toEqual({ erros: ['Esta retirada já está apagada.'] });
  });
});
