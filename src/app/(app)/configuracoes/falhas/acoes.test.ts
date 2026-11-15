import { beforeEach, describe, expect, it, vi } from 'vitest';

const exigirPermissao = vi.hoisted(() => vi.fn());
const reenviarFalha = vi.hoisted(() => vi.fn());
const dispensarFalha = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/db', () => ({ obterDb: () => ({}) }));
// O servidor.ts começa com `import 'server-only'`, que quebra fora do Next.
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao }));
vi.mock('@/modules/acabamento/falhas', async (importar) => {
  const real = await importar<typeof import('@/modules/acabamento/falhas')>();
  return { ...real, reenviarFalha, dispensarFalha };
});

import { ErroFalhas } from '@/modules/acabamento/falhas';
import { acaoFalha } from './acoes';

const UUID = '3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b';
const form = (operacao?: string, falha?: string) => {
  const f = new FormData();
  if (operacao !== undefined) f.set('operacao', operacao);
  if (falha !== undefined) f.set('falha', falha);
  return f;
};
const ANTES = { erros: [], ok: null };

beforeEach(() => {
  exigirPermissao.mockReset().mockResolvedValue({ id: 'u1', perfil: 'GESTOR' });
  reenviarFalha.mockReset();
  dispensarFalha.mockReset();
  revalidatePath.mockReset();
});

describe('acaoFalha', () => {
  it.each([
    ['operação inválida', form('apagar', UUID)],
    ['sem operação', form(undefined, UUID)],
    ['falha que não é UUID', form('reenviar', 'abc')],
    ['sem falha', form('dispensar')],
  ])('%s: Pedido inválido, sem chamar nada', async (_n, dados) => {
    expect(await acaoFalha(ANTES, dados)).toEqual({ erros: ['Pedido inválido.'], ok: null });
    expect(reenviarFalha).not.toHaveBeenCalled();
    expect(dispensarFalha).not.toHaveBeenCalled();
  });

  it('ErroFalhas vira { erros: [mensagem] }', async () => {
    reenviarFalha.mockRejectedValue(new ErroFalhas('Esta falha já foi tratada.'));
    expect(await acaoFalha(ANTES, form('reenviar', UUID))).toEqual({ erros: ['Esta falha já foi tratada.'], ok: null });
    dispensarFalha.mockRejectedValue(new ErroFalhas('Falha não encontrada.'));
    expect(await acaoFalha(ANTES, form('dispensar', UUID))).toEqual({ erros: ['Falha não encontrada.'], ok: null });
  });

  it('erro que não é ErroFalhas sobe', async () => {
    dispensarFalha.mockRejectedValue(new Error('boom'));
    await expect(acaoFalha(ANTES, form('dispensar', UUID))).rejects.toThrow('boom');
  });

  it('as duas mensagens de ok e a revalidação', async () => {
    reenviarFalha.mockResolvedValue({ tarefa: 'midia.retencao' });
    const r = await acaoFalha(ANTES, form('reenviar', UUID));
    expect(r.erros).toEqual([]);
    expect(r.ok).toMatch(/^Tarefa ".+" reenviada\. Ela roda em instantes\.$/);
    dispensarFalha.mockResolvedValue(undefined);
    expect(await acaoFalha(ANTES, form('dispensar', UUID))).toEqual({ erros: [], ok: 'Falha dispensada.' });
    expect(revalidatePath).toHaveBeenCalledWith('/configuracoes/falhas');
  });

  it('sem permissão, não chama nada', async () => {
    exigirPermissao.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(acaoFalha(ANTES, form('reenviar', UUID))).rejects.toThrow('NEXT_REDIRECT');
    expect(exigirPermissao).toHaveBeenCalledWith('administrar');
    expect(reenviarFalha).not.toHaveBeenCalled();
    expect(dispensarFalha).not.toHaveBeenCalled();
  });
});
