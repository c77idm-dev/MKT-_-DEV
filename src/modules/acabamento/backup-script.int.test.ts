import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { desc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { execucoesBackup } from '@/db/schema';
import { criarDbTeste, limparTabelas, urlBancoTeste } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';

const PG_BIN = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const BANCO_RESTAURADO = 'devolucoes_restauracao_f6_teste';
const RCLONE_FALSO = `#!/bin/sh
# rclone falso dos testes: o "bucket" é a pasta $RCLONE_FALSO_DIR.
cmd=$1
for ultimo in "$@"; do :; done
alvo="$RCLONE_FALSO_DIR/$(printf '%s' "$ultimo" | sed 's#^backup:##')"
case "$cmd" in
  rcat) mkdir -p "$(dirname "$alvo")"; cat > "$alvo" ;;
  cat) cat "$alvo" ;;
  lsjson) printf '[{"Size":%s}]\\n' "$(wc -c < "$alvo" | tr -d ' ')" ;;
  delete) echo "$*" >> "$RCLONE_FALSO_DIR/delete.log" ;;
  *) echo "rclone falso: comando $cmd" >&2; exit 2 ;;
esac
`;

function ambiente(extra: Record<string, string> = {}) {
  const base = mkdtempSync(join(tmpdir(), 'backup-'));
  const bin = join(base, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'rclone'), RCLONE_FALSO);
  chmodSync(join(bin, 'rclone'), 0o755);
  const midia = join(base, 'midia');
  mkdirSync(midia);
  writeFileSync(join(midia, 'foto.jpg'), 'jpeg de teste');
  const url = new URL(urlBancoTeste());
  return {
    base,
    env: {
      ...process.env,
      PATH: [bin, PG_BIN, process.env.PATH].join(delimiter),
      PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1),
      BACKUP_S3_BUCKET: 'bucket-teste', BACKUP_SENHA: 'senha-de-teste', ARMAZENAMENTO: 'disco', MIDIA_DIR: midia,
      S3_BUCKET: 'bucket-das-midias', RCLONE_FALSO_DIR: join(base, 'bucket'),
      ...extra,
    },
  };
}

const script = (nome: string, args: string[], env: NodeJS.ProcessEnv) => spawnSync('sh', [`docker/backup/${nome}`, ...args], { env, encoding: 'utf8' });
const sh = (comando: string, env: NodeJS.ProcessEnv) => spawnSync('sh', ['-c', comando], { env, encoding: 'utf8' });
const comPg = { ...process.env, PATH: [PG_BIN, process.env.PATH].join(delimiter) };
const temFerramentas = sh('command -v pg_dump && command -v pg_restore && command -v psql && command -v createdb && command -v openssl', comPg).status === 0;

const { db, sql } = criarDbTeste();
beforeEach(() => limparTabelas(sql));
afterAll(async () => {
  if (temFerramentas) sh(`dropdb --if-exists ${BANCO_RESTAURADO}`, ambiente().env);
  await sql.end();
});

const ultima = async () => (await db.select().from(execucoesBackup).orderBy(desc(execucoesBackup.iniciadoEm)))[0];

describe.skipIf(!temFerramentas)('docker/backup (spec §10)', () => {
  it('backup.sh cifra o pg_dump e as mídias, envia ao bucket, pede a limpeza dos antigos e registra OK', async () => {
    const { base, env } = ambiente();
    const r = script('backup.sh', [], env);
    expect(r.status, r.stderr).toBe(0);

    const [banco] = readdirSync(join(base, 'bucket', 'bucket-teste', 'banco'));
    expect(banco).toMatch(/^devolucoes-\d{4}-\d{2}-\d{2}_\d{6}\.dump\.enc$/);
    const cifrado = join(base, 'bucket', 'bucket-teste', 'banco', banco);
    expect(readFileSync(cifrado).subarray(0, 8).toString()).toBe('Salted__'); // cifrado, não é um dump legível
    const lista = sh(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:senha-de-teste -in "${cifrado}" | pg_restore --list`, env);
    expect(lista.status, lista.stderr).toBe(0);
    expect(lista.stdout).toContain('execucoes_backup');

    const [midia] = readdirSync(join(base, 'bucket', 'bucket-teste', 'midia'));
    const tar = sh(`openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:senha-de-teste -in "${join(base, 'bucket', 'bucket-teste', 'midia', midia)}" | tar -tf -`, env);
    expect(tar.stdout).toContain('midia/foto.jpg');

    expect(readFileSync(join(base, 'bucket', 'delete.log'), 'utf8')).toMatch(/--min-age 30d backup:bucket-teste\/banco/);
    const linha = await ultima();
    expect(linha).toMatchObject({ situacao: 'OK', arquivoBanco: `banco/${banco}`, arquivoMidia: `midia/${midia}` });
    expect(linha.tamanhoBanco).toBeGreaterThan(1024);
    expect(linha.terminadoEm).toBeInstanceOf(Date);
  }, 60_000);

  it('restaurar.sh devolve o banco num banco separado e mostra as contagens (spec §14: restauração testada)', async () => {
    await criarUsuarioTeste(db, 'GESTOR');
    await criarUsuarioTeste(db, 'OPERADOR');
    const { base, env } = ambiente();
    expect(script('backup.sh', [], env).status).toBe(0);
    const [banco] = readdirSync(join(base, 'bucket', 'bucket-teste', 'banco'));
    const r = script('restaurar.sh', [`banco/${banco}`, BANCO_RESTAURADO], env);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('usuarios: 2');
    expect(r.stdout).toContain(`Restauração concluída em ${BANCO_RESTAURADO}.`);
    // Rodar de novo recria o banco de restauração do zero.
    expect(script('restaurar.sh', [`banco/${banco}`, BANCO_RESTAURADO], env).status).toBe(0);
  }, 120_000);

  it('restaurar.sh com senha errada ou arquivo inexistente sai com 1 e não apaga o banco de destino', () => {
    const { base, env } = ambiente();
    expect(script('backup.sh', [], env).status).toBe(0);
    const [banco] = readdirSync(join(base, 'bucket', 'bucket-teste', 'banco'));
    const destino = `${BANCO_RESTAURADO}_intacto`;
    sh(`dropdb --if-exists ${destino}`, env);
    expect(sh(`createdb ${destino} && psql -X -q -d ${destino} -c "create table prova(id int); insert into prova values (1),(2)"`, env).status).toBe(0);
    try {
      const senhaErrada = script('restaurar.sh', [`banco/${banco}`, destino], { ...env, BACKUP_SENHA: 'outra-senha' });
      expect(senhaErrada.status).toBe(1);
      expect(senhaErrada.stderr).toContain('Nada foi apagado');
      const inexistente = script('restaurar.sh', ['banco/nao-existe.dump.enc', destino], env);
      expect(inexistente.status).toBe(1);
      expect(sh(`psql -X -At -d ${destino} -c "select count(*) from prova"`, env).stdout.trim()).toBe('2');
    } finally {
      sh(`dropdb --if-exists ${destino}`, env);
    }
  }, 120_000);

  it('restaurar.sh recusa um destino fora de devolucoes_restauracao* sem CONFIRMAR, antes de apagar qualquer coisa', () => {
    const { env } = ambiente();
    const r = script('restaurar.sh', ['banco/qualquer.dump.enc', 'postgres'], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Destino recusado');
    expect(sh(`psql -X -At -d postgres -c "select 1"`, env).stdout.trim()).toBe('1'); // o banco postgres continua lá
  });

  it('com ARMAZENAMENTO=s3 não copia as mídias (já estão fora da VPS)', () => {
    const { base, env } = ambiente({ ARMAZENAMENTO: 's3' });
    expect(script('backup.sh', [], env).status).toBe(0);
    expect(existsSync(join(base, 'bucket', 'bucket-teste', 'midia'))).toBe(false);
  }, 60_000);

  it('sem BACKUP_SENHA: sai com erro e registra FALHOU com a mensagem acentuada (psql do Windows)', async () => {
    const { base, env } = ambiente({ BACKUP_SENHA: '' });
    expect(script('backup.sh', [], env).status).toBe(1);
    expect(existsSync(join(base, 'bucket'))).toBe(false);
    expect(await ultima()).toMatchObject({ situacao: 'FALHOU', erro: 'BACKUP_SENHA não definida.' });
  }, 60_000);

  it('recusa o bucket das mídias como bucket de backup (decisão 19)', async () => {
    const { env } = ambiente({ BACKUP_S3_BUCKET: 'bucket-das-midias' });
    expect(script('backup.sh', [], env).status).toBe(1);
    expect(await ultima()).toMatchObject({ situacao: 'FALHOU', erro: 'O bucket de backup não pode ser o mesmo das mídias (S3_BUCKET).' });
  }, 60_000);
});
