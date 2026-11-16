import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroRetirada } from '@/modules/retiradas/erros';

const ordem: string[] = [];
vi.mock('next/cache', () => ({ revalidatePath: vi.fn((caminho: string) => ordem.push(`revalidate:${caminho}`)) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    ordem.push(`redirect:${url}`);
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: vi.fn(async () => ({ id: 'u1', perfil: 'OPERADOR' })) }));
const criarRetirada = vi.hoisted(() => vi.fn());
vi.mock('@/modules/retiradas/retiradas', () => ({ criarRetirada }));

import { criarRetiradaAcao } from './acoes';

beforeEach(() => {
  ordem.length = 0;
  criarRetirada.mockReset();
});

function formulario(codigo: string): FormData {
  const dados = new FormData();
  dados.set('codigoEtiqueta', codigo);
  return dados;
}

describe('criarRetiradaAcao', () => {
  it('abre a retirada e vai para a tela dela', async () => {
    criarRetirada.mockResolvedValue({ id: 'r1', codigo: 'RF-000001', nova: true });
    await expect(criarRetiradaAcao({ erro: null }, formulario('FULL123'))).rejects.toThrow('NEXT_REDIRECT');
    expect(criarRetirada).toHaveBeenCalledWith({}, 'FULL123', { id: 'u1', perfil: 'OPERADOR' });
    expect(ordem).toEqual(['revalidate:/fluxo/retiradas-full', 'redirect:/fluxo/retiradas-full/RF-000001']);
  });

  it('erro de regra volta para a tela com a mensagem', async () => {
    criarRetirada.mockRejectedValue(new ErroRetirada('Leia ou digite o código da etiqueta.'));
    expect(await criarRetiradaAcao({ erro: null }, formulario(''))).toEqual({ erro: 'Leia ou digite o código da etiqueta.' });
    expect(ordem).toEqual([]);
  });
});
