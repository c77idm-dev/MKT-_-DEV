import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { usuarios } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { verificarSenha } from './senha';
import { criarUsuario, ErroEmailEmUso } from './usuarios';

const { db, sql } = criarDbTeste();
beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

describe('criarUsuario', () => {
  it('cria o usuário com e-mail normalizado e a senha só em hash', async () => {
    const criado = await criarUsuario(db, {
      nome: '  Maria da Silva ',
      email: ' Maria@Empresa.com ',
      senha: 'senha-segura-123',
      perfil: 'OPERADOR',
    });

    expect(criado).toMatchObject({ nome: 'Maria da Silva', email: 'maria@empresa.com', perfil: 'OPERADOR' });
    const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, criado.id));
    expect(linha.senhaHash).not.toBe('senha-segura-123');
    expect(await verificarSenha(linha.senhaHash, 'senha-segura-123')).toBe(true);
    expect(linha.ativo).toBe(true);
  });

  it('recusa e-mail repetido, sem diferenciar maiúsculas', async () => {
    await criarUsuario(db, { nome: 'A', email: 'a@empresa.com', senha: 'senha-segura-123', perfil: 'FISCAL' });
    await expect(
      criarUsuario(db, { nome: 'B', email: 'A@EMPRESA.COM', senha: 'senha-segura-456', perfil: 'GESTOR' }),
    ).rejects.toBeInstanceOf(ErroEmailEmUso);
  });

  it('recusa dados inválidos', async () => {
    await expect(
      criarUsuario(db, { nome: '', email: 'x@empresa.com', senha: 'senha-segura-123', perfil: 'GESTOR' }),
    ).rejects.toThrow('Informe o nome');
    await expect(
      criarUsuario(db, { nome: 'X', email: 'não-é-email', senha: 'senha-segura-123', perfil: 'GESTOR' }),
    ).rejects.toThrow('E-mail inválido');
  });
});
