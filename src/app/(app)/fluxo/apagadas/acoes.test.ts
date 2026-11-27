import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  revalidar: vi.fn(),
  restaurarDevolucao: vi.fn(),
  restaurarRetirada: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidar }));
vi.mock('@/db', () => ({ obterDb: () => ({ db: true }) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: mocks.exigir }));
vi.mock('@/modules/devolucoes/correcoes', () => ({ restaurarDevolucao: mocks.restaurarDevolucao }));
vi.mock('@/modules/retiradas/correcoes', () => ({ restaurarRetirada: mocks.restaurarRetirada }));

import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { ErroRetirada } from '@/modules/retiradas/erros';
import { restaurarAcao } from './acoes';

const GESTOR = { id: 'g1', perfil: 'GESTOR' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigir.mockResolvedValue(GESTOR);
});

describe('Restaurar, na lista Apagadas (E29)', () => {
  it('exige administrar; sem ela, nada é restaurado', async () => {
    mocks.exigir.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(restaurarAcao('devolucao', 'd1')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.exigir).toHaveBeenCalledWith('administrar');
    expect(mocks.restaurarDevolucao).not.toHaveBeenCalled();
  });

  it('a devolução volta com o aviso do serviço (pedido com outra devolução em andamento)', async () => {
    mocks.restaurarDevolucao.mockResolvedValue({ aviso: 'O pedido 123 também está na devolução DEV-000009, em andamento.' });
    expect(await restaurarAcao('devolucao', 'd1')).toEqual({ ok: true, aviso: 'O pedido 123 também está na devolução DEV-000009, em andamento.' });
    expect(mocks.restaurarDevolucao).toHaveBeenCalledWith({ db: true }, 'd1', GESTOR);
    expect(mocks.revalidar).toHaveBeenCalledWith('/fluxo', 'layout');
  });

  it('a retirada volta sem aviso', async () => {
    mocks.restaurarRetirada.mockResolvedValue(undefined);
    expect(await restaurarAcao('retirada', 'r1')).toEqual({ ok: true, aviso: null });
    expect(mocks.restaurarRetirada).toHaveBeenCalledWith({ db: true }, 'r1', GESTOR);
  });

  it('a recusa do servidor volta com a mensagem; tipo desconhecido não chama nada', async () => {
    mocks.restaurarDevolucao.mockRejectedValue(new ErroDevolucao('Esta devolução foi apagada de vez depois de 90 dias e não volta.'));
    expect(await restaurarAcao('devolucao', 'd1')).toEqual({ ok: false, mensagem: 'Esta devolução foi apagada de vez depois de 90 dias e não volta.' });
    mocks.restaurarRetirada.mockRejectedValue(new ErroRetirada('Esta retirada não está apagada.'));
    expect(await restaurarAcao('retirada', 'r1')).toEqual({ ok: false, mensagem: 'Esta retirada não está apagada.' });
    expect(await restaurarAcao('lote', 'x')).toEqual({ ok: false, mensagem: 'Não encontrado.' });
    expect(mocks.revalidar).not.toHaveBeenCalled();
  });
});
