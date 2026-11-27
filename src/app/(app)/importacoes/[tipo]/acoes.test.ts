import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exigirOuBancada: vi.fn(),
  exigirPermissao: vi.fn(),
  registrarUpload: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`NEXT_REDIRECT ${destino}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirOuBancada: mocks.exigirOuBancada, exigirPermissao: mocks.exigirPermissao }));
vi.mock('@/modules/importacao/servico', () => ({
  confirmarImportacao: vi.fn(),
  definirMapeamento: vi.fn(),
  ErroImportacao: class extends Error {},
  obterImportacao: vi.fn(),
  registrarUpload: mocks.registrarUpload,
}));

import { confirmarImportacaoAcao, definirMapeamentoAcao, enviarPlanilhaAcao } from './acoes';

const ID = '00000000-0000-4000-8000-000000000000';

function comArquivo(): FormData {
  const dados = new FormData();
  dados.set('arquivo', new File(['a;b\n1;2\n'], 'p.csv', { type: 'text/csv' }));
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('importação de devoluções (E29: só o Gestor)', () => {
  it('as três ações conferem cadastrar_devolucoes no servidor; o Operador vai para a Bancada e nada é gravado', async () => {
    mocks.exigirOuBancada.mockRejectedValue(new Error('NEXT_REDIRECT /bancada'));
    await expect(enviarPlanilhaAcao('devolucoes', { erros: [] }, comArquivo())).rejects.toThrow('NEXT_REDIRECT /bancada');
    await expect(definirMapeamentoAcao('devolucoes', ID, new FormData())).rejects.toThrow('NEXT_REDIRECT /bancada');
    await expect(confirmarImportacaoAcao('devolucoes', ID, { erros: [] }, new FormData())).rejects.toThrow('NEXT_REDIRECT /bancada');
    expect(mocks.exigirOuBancada.mock.calls).toEqual([['cadastrar_devolucoes'], ['cadastrar_devolucoes'], ['cadastrar_devolucoes']]);
    expect(mocks.exigirPermissao).not.toHaveBeenCalled();
    expect(mocks.registrarUpload).not.toHaveBeenCalled();
  });

  it('a importação de produtos e fornecedores continua como está (o "não encontrada" do exigirPermissao)', async () => {
    mocks.exigirPermissao.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(enviarPlanilhaAcao('produtos', { erros: [] }, comArquivo())).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(enviarPlanilhaAcao('fornecedores', { erros: [] }, comArquivo())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.exigirPermissao.mock.calls).toEqual([['gerir_catalogo'], ['gerir_catalogo']]);
    expect(mocks.exigirOuBancada).not.toHaveBeenCalled();
  });
});
