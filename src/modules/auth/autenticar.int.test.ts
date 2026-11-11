import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { usuarios } from '@/db/schema';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { autenticar, BLOQUEIO_MS, MAX_FALHAS } from './autenticar';
import { criarUsuario, type UsuarioSessao } from './usuarios';

const { db, sql } = criarDbTeste();
const EMAIL = 'bruno@empresa.com';
const SENHA = 'senha-segura-123';
let usuario: UsuarioSessao;

async function linhaDoUsuario() {
  const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, usuario.id));
  return linha;
}

beforeEach(async () => {
  await limparTabelas(sql);
  usuario = await criarUsuario(db, { nome: 'Bruno', email: EMAIL, senha: SENHA, perfil: 'OPERADOR' });
});
afterAll(async () => {
  await sql.end();
});

describe('autenticar', () => {
  it('aceita e-mail e senha certos, ignorando maiúsculas e espaços no e-mail', async () => {
    expect(await autenticar(db, '  Bruno@Empresa.COM ', SENHA)).toEqual({ ok: true, usuario });
  });

  it('recusa senha errada e conta a falha', async () => {
    expect(await autenticar(db, EMAIL, 'senha-errada-000')).toEqual({ ok: false, motivo: 'credenciais' });
    expect((await linhaDoUsuario()).falhasLogin).toBe(1);
  });

  it('recusa e-mail inexistente com a mesma mensagem', async () => {
    expect(await autenticar(db, 'ninguem@empresa.com', SENHA)).toEqual({ ok: false, motivo: 'credenciais' });
  });

  it('recusa usuário desativado com a mesma mensagem', async () => {
    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, usuario.id));
    expect(await autenticar(db, EMAIL, SENHA)).toEqual({ ok: false, motivo: 'credenciais' });
  });

  it(`bloqueia por 15 minutos na ${MAX_FALHAS}ª senha errada seguida`, async () => {
    const agora = new Date('2026-11-11T12:00:00Z');
    for (let i = 1; i < MAX_FALHAS; i++) {
      expect(await autenticar(db, EMAIL, 'senha-errada-000', agora)).toEqual({ ok: false, motivo: 'credenciais' });
    }
    expect(await autenticar(db, EMAIL, 'senha-errada-000', agora)).toEqual({ ok: false, motivo: 'bloqueado' });

    const aindaBloqueado = new Date(agora.getTime() + BLOQUEIO_MS - 1000);
    expect(await autenticar(db, EMAIL, SENHA, aindaBloqueado)).toEqual({ ok: false, motivo: 'bloqueado' });

    const liberado = new Date(agora.getTime() + BLOQUEIO_MS + 1000);
    expect(await autenticar(db, EMAIL, SENHA, liberado)).toEqual({ ok: true, usuario });
    const linha = await linhaDoUsuario();
    expect(linha.falhasLogin).toBe(0);
    expect(linha.bloqueadoAte).toBeNull();
  });

  it('zera as falhas depois de um login certo', async () => {
    await autenticar(db, EMAIL, 'senha-errada-000');
    await autenticar(db, EMAIL, 'senha-errada-000');
    await autenticar(db, EMAIL, SENHA);
    expect((await linhaDoUsuario()).falhasLogin).toBe(0);
  });
});
