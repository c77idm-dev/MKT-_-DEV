import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { criarDb } from '@/db/client';
import { PERFIS, type Perfil } from '@/modules/auth/perfis';
import { criarUsuario, ErroEmailEmUso } from '@/modules/auth/usuarios';

const USO = 'Uso: --nome "Nome Sobrenome" --email pessoa@empresa.com --perfil OPERADOR|FISCAL|GESTOR';

async function main() {
  const { values } = parseArgs({
    options: { nome: { type: 'string' }, email: { type: 'string' }, perfil: { type: 'string' } },
  });
  if (!values.nome || !values.email || !values.perfil) {
    console.error(USO);
    process.exit(1);
  }
  const perfil = values.perfil.toUpperCase();
  if (!(PERFIS as readonly string[]).includes(perfil)) {
    console.error(`Perfil inválido: ${values.perfil}. ${USO}`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const senha = await rl.question('Senha (mínimo 8 caracteres; aparece enquanto digita): ');
  rl.close();

  const { db, sql } = criarDb(url);
  try {
    const u = await criarUsuario(db, { nome: values.nome, email: values.email, senha, perfil: perfil as Perfil });
    console.log(`Usuário criado: ${u.nome} <${u.email}> (${u.perfil})`);
  } catch (erro) {
    if (erro instanceof ErroEmailEmUso) {
      console.error('Já existe um usuário com esse e-mail.');
      process.exitCode = 1;
    } else {
      throw erro;
    }
  } finally {
    await sql.end();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
