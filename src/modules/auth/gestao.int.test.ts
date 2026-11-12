import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sessoes, usuarios } from '@/db/schema';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { autenticar } from './autenticar';
import { alterarPerfil, criarUsuarioPeloGestor, definirAtivo, ErroGestaoUsuario, listarUsuarios } from './gestao';
import { criarSessao, validarSessao } from './sessoes';
import type { UsuarioSessao } from './usuarios';

const { db, sql } = criarDbTeste();
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

describe('Usuários (spec §6.8)', () => {
  it('o Gestor cria um usuário e o histórico registra quem criou', async () => {
    const novo = await criarUsuarioPeloGestor(db, { nome: 'Carla', email: 'carla@empresa.com', senha: 'senha-carla-123', perfil: 'OPERADOR' }, gestor);
    expect(novo).toMatchObject({ nome: 'Carla', perfil: 'OPERADOR' });
    expect(await listarEventos(db, 'usuario', novo.id)).toEqual([
      expect.objectContaining({ acao: 'usuario_criado', para: 'OPERADOR', usuarioNome: gestor.nome }),
    ]);
  });

  it('lista os ativos primeiro, em ordem alfabética', async () => {
    const zeca = await criarUsuarioPeloGestor(db, { nome: 'Zeca', email: 'zeca@empresa.com', senha: 'senha-zeca-123', perfil: 'FISCAL' }, gestor);
    await criarUsuarioPeloGestor(db, { nome: 'Ana', email: 'ana@empresa.com', senha: 'senha-ana-1234', perfil: 'OPERADOR' }, gestor);
    await definirAtivo(db, zeca.id, false, gestor);
    expect((await listarUsuarios(db)).map((u) => [u.nome, u.ativo])).toEqual([
      ['Ana', true],
      [gestor.nome, true],
      ['Zeca', false],
    ]);
  });

  it('muda o perfil, registra de → para, e a sessão aberta já vale com o perfil novo', async () => {
    const alvo = await criarUsuarioTeste(db, 'OPERADOR');
    const { token } = await criarSessao(db, alvo.id);
    await alterarPerfil(db, alvo.id, 'FISCAL', gestor);
    expect((await validarSessao(db, token))?.perfil).toBe('FISCAL');
    expect((await listarEventos(db, 'usuario', alvo.id)).at(-1)).toMatchObject({
      acao: 'perfil_alterado',
      de: 'OPERADOR',
      para: 'FISCAL',
      usuarioNome: gestor.nome,
    });
  });

  it('desativar encerra as sessões na hora; reativar deixa entrar de novo', async () => {
    const alvo = await criarUsuarioTeste(db, 'OPERADOR');
    await criarSessao(db, alvo.id);
    await criarSessao(db, alvo.id);
    await definirAtivo(db, alvo.id, false, gestor);
    expect(await db.select().from(sessoes).where(eq(sessoes.usuarioId, alvo.id))).toHaveLength(0);
    expect((await autenticar(db, alvo.email, 'senha-de-teste-123')).ok).toBe(false);
    await definirAtivo(db, alvo.id, true, gestor);
    expect((await autenticar(db, alvo.email, 'senha-de-teste-123')).ok).toBe(true);
    expect((await listarEventos(db, 'usuario', alvo.id)).map((e) => e.acao)).toEqual(['usuario_desativado', 'usuario_reativado']);
  });

  it('o Gestor não muda o próprio perfil nem se desativa (sempre sobra um Gestor ativo)', async () => {
    await expect(alterarPerfil(db, gestor.id, 'OPERADOR', gestor)).rejects.toThrow(new ErroGestaoUsuario('Você não pode mudar o próprio perfil.'));
    await expect(definirAtivo(db, gestor.id, false, gestor)).rejects.toThrow(new ErroGestaoUsuario('Você não pode desativar o próprio usuário.'));
  });

  it('só o Gestor gerencia usuários; perfil e usuário precisam existir', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const alvo = await criarUsuarioTeste(db, 'FISCAL');
    await expect(definirAtivo(db, alvo.id, false, operador)).rejects.toThrow('Só o Gestor gerencia usuários.');
    await expect(alterarPerfil(db, alvo.id, 'CHEFE', gestor)).rejects.toThrow('Perfil inválido.');
    await expect(alterarPerfil(db, '00000000-0000-0000-0000-000000000000', 'FISCAL', gestor)).rejects.toThrow('Usuário não encontrado.');
  });
});

describe('Trava contra ficar sem Gestor', () => {
  it('recusa rebaixar ou desativar o último Gestor ativo, mesmo por um ator desatualizado', async () => {
    const outro = await criarUsuarioTeste(db, 'GESTOR');
    // O outro Gestor foi desativado enquanto a sessão do ator ainda estava aberta: só `outro` sobra com o perfil.
    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, gestor.id));
    await expect(alterarPerfil(db, outro.id, 'OPERADOR', gestor)).rejects.toThrow(
      new ErroGestaoUsuario('O sistema precisa de pelo menos um Gestor ativo.'),
    );
    await expect(definirAtivo(db, outro.id, false, gestor)).rejects.toThrow(
      new ErroGestaoUsuario('O sistema precisa de pelo menos um Gestor ativo.'),
    );
    expect((await listarUsuarios(db)).find((u) => u.id === outro.id)).toMatchObject({ perfil: 'GESTOR', ativo: true });
  });

  it('com dois Gestores ativos, um pode rebaixar o outro', async () => {
    const outro = await criarUsuarioTeste(db, 'GESTOR');
    await alterarPerfil(db, outro.id, 'FISCAL', gestor);
    expect((await listarUsuarios(db)).find((u) => u.id === outro.id)?.perfil).toBe('FISCAL');
  });

  it('desativar um Gestor com sessões abertas as encerra', async () => {
    const outro = await criarUsuarioTeste(db, 'GESTOR');
    await criarSessao(db, outro.id);
    await definirAtivo(db, outro.id, false, gestor);
    expect(await db.select().from(sessoes).where(eq(sessoes.usuarioId, outro.id))).toHaveLength(0);
  });

  // Dois Gestores se rebaixando/desativando ao mesmo tempo: um passa, o outro recebe a recusa (nunca deadlock).
  const MSG = 'O sistema precisa de pelo menos um Gestor ativo.';
  /**
   * Segura as duas linhas de Gestor numa transação externa, dispara as duas operações juntas e só então solta.
   * Assim as duas começam no mesmo instante, cada uma com a linha do seu alvo (no código sem trava global,
   * cada uma trava o próprio alvo e espera a do outro: deadlock garantido).
   */
  async function corrida(operacao: (alvo: UsuarioSessao, ator: UsuarioSessao) => Promise<void>) {
    // Só A e B podem ser os Gestores ativos nesta corrida.
    await db.update(usuarios).set({ ativo: false }).where(eq(usuarios.id, gestor.id));
    const a = await criarUsuarioTeste(db, 'GESTOR');
    const b = await criarUsuarioTeste(db, 'GESTOR');
    let soltar!: () => void;
    const segurar = new Promise<void>((resolve) => (soltar = resolve));
    let travou!: () => void;
    const jaTravou = new Promise<void>((resolve) => (travou = resolve));
    const externa = sql.begin(async (tx) => {
      await tx`select id from usuarios where id in (${a.id}, ${b.id}) for update`;
      travou();
      await segurar;
    });
    await jaTravou;
    const resultados = Promise.allSettled([operacao(b, a), operacao(a, b)]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    soltar();
    await externa;
    const falhas = (await resultados).filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(falhas.map((f) => String(f.reason))).toEqual([String(new ErroGestaoUsuario(MSG))]);
    const ativos = (await listarUsuarios(db)).filter((u) => u.perfil === 'GESTOR' && u.ativo);
    expect(ativos).toHaveLength(1);
  }

  it('dois Gestores se rebaixando ao mesmo tempo: um passa, o outro é recusado, sem deadlock', async () => {
    await corrida((alvo, ator) => alterarPerfil(db, alvo.id, 'OPERADOR', ator));
  });

  it('dois Gestores se desativando ao mesmo tempo: um passa, o outro é recusado, sem deadlock', async () => {
    await corrida((alvo, ator) => definirAtivo(db, alvo.id, false, ator));
  });
});
