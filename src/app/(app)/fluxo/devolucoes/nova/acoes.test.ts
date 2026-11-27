import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exigirOuBancada: vi.fn(),
  criar: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT ${destino}`);
  }),
}));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirOuBancada: mocks.exigirOuBancada, exigirPermissao: vi.fn() }));
vi.mock('@/modules/devolucoes/criar', async (original) => ({ ...(await original<object>()), criarDevolucao: mocks.criar }));

import { criarDevolucaoAcao } from './acoes';

function formulario(): FormData {
  const dados = new FormData();
  dados.set('canal', 'SHOPEE');
  dados.set('pedido', 'P-1');
  dados.set('rastreio', 'BR1');
  dados.set('itens.0.sku', 'SKU-1');
  dados.set('itens.0.quantidade', '1');
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('criarDevolucaoAcao (E29: só o Gestor cria devolução)', () => {
  it('confere cadastrar_devolucoes no servidor antes de qualquer coisa; o Operador vai para a Bancada e nada é criado', async () => {
    mocks.exigirOuBancada.mockRejectedValue(new Error('NEXT_REDIRECT /bancada'));
    await expect(criarDevolucaoAcao({ erros: [] }, formulario())).rejects.toThrow('NEXT_REDIRECT /bancada');
    expect(mocks.exigirOuBancada).toHaveBeenCalledWith('cadastrar_devolucoes');
    expect(mocks.criar).not.toHaveBeenCalled();
  });
});
