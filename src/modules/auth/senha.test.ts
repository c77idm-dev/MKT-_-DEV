import { describe, expect, it } from 'vitest';
import { gerarHashSenha, verificarSenha } from './senha';

describe('senha', () => {
  it('gera um hash argon2id que confere com a senha certa e não com a errada', async () => {
    const hash = await gerarHashSenha('senha-segura-123');
    expect(hash).not.toContain('senha-segura-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verificarSenha(hash, 'senha-segura-123')).toBe(true);
    expect(await verificarSenha(hash, 'outra-senha-456')).toBe(false);
  });

  it('recusa senha com menos de 8 caracteres', async () => {
    await expect(gerarHashSenha('curta')).rejects.toThrow('A senha precisa ter pelo menos 8 caracteres');
  });

  it('devolve false para um hash inválido em vez de lançar erro', async () => {
    expect(await verificarSenha('não-é-um-hash', 'qualquer-coisa')).toBe(false);
  });
});
