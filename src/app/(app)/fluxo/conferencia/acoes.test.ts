import { beforeEach, describe, expect, it, vi } from 'vitest';

const ordem: string[] = [];
vi.mock('next/cache', () => ({ revalidatePath: vi.fn((...a: unknown[]) => ordem.push(`revalidate:${a.join(',')}`)) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    ordem.push(`redirect:${url}`);
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: vi.fn(async () => ({ id: 'u1' })) }));
vi.mock('@/modules/conferencia/localizar', () => ({ localizarParaConferencia: vi.fn(async () => ({ id: 'd1', codigo: 'DEV-1' })) }));
vi.mock('@/modules/conferencia/trava', () => ({ iniciarConferencia: vi.fn(async () => undefined) }));

import { abrirConferenciaAcao } from './acoes';

beforeEach(() => {
  ordem.length = 0;
});

describe('abrirConferenciaAcao', () => {
  it('revalida a lista e o contador do fluxo antes de redirecionar para a conferência', async () => {
    const dados = new FormData();
    dados.set('codigo', 'DEV-1');
    await expect(abrirConferenciaAcao({ erros: [] }, dados)).rejects.toThrow('NEXT_REDIRECT');
    expect(ordem).toEqual(['revalidate:/fluxo,layout', 'redirect:/fluxo/devolucoes/DEV-1/conferencia']);
  });
});
