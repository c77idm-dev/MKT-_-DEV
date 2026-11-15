import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIMITE_BATIMENTO_MS, NOME_ARQUIVO_BATIMENTO } from '../src/worker/batimento';

const ler = (caminho: string) => (existsSync(caminho) ? readFileSync(caminho, 'utf8').replaceAll('\r\n', '\n') : '');
const compose = ler('docker-compose.prod.yml');
const producaoExemplo = ler('.env.producao.example');
const backupExemplo = ler('.env.backup.example');
const gitignore = ler('.gitignore');

/** O bloco de um serviço: de "  nome:" até o próximo serviço (2 espaços) ou até "volumes:" no começo da linha. */
export function servico(nome: string): string {
  const m = compose.match(new RegExp(`\\n  ${nome}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|\\nvolumes:)`));
  if (!m) throw new Error(`Serviço ${nome} não encontrado no docker-compose.prod.yml`);
  return m[1];
}

describe('docker-compose.prod.yml (VPS compartilhada, spec §13)', () => {
  it('só o web publica porta, e só em 127.0.0.1:3020', () => {
    expect([...compose.matchAll(/"(\d[\d.]*:\d+:\d+)"/g)].map((m) => m[1])).toEqual(['127.0.0.1:3020:3000']);
  });
  it('todo serviço tem limite de memória', () => {
    for (const nome of ['web', 'worker', 'postgres', 'backup']) expect(servico(nome)).toMatch(/memory: \d+[mg]/);
  });
  it('ninguém usa a rede do host, modo privilegiado ou nome de container fixo', () => {
    expect(compose).not.toMatch(/network_mode:\s*host|privileged:\s*true|container_name:/);
  });
  it('healthcheck do web no /api/saude e do worker no batimento (decisão 17)', () => {
    expect(servico('web')).toMatch(/healthcheck:[\s\S]*\/api\/saude/);
    expect(servico('worker')).toContain(NOME_ARQUIVO_BATIMENTO);
    expect(servico('worker')).toContain(String(LIMITE_BATIMENTO_MS));
  });

  it('backup: postgres 17, scripts e mídias só leitura, fuso de Brasília, sem porta (decisão 19)', () => {
    const b = servico('backup');
    expect(b).toContain('image: postgres:17-alpine');
    expect(b).toContain('./docker/backup:/backup:ro');
    expect(b).toContain('midia:/data:ro');
    expect(b).toContain('TZ: America/Sao_Paulo');
    expect(b).not.toMatch(/ports:/);
  });

  it('backup: lê só o .env.backup e não recebe os segredos do sistema (decisão 19, E20)', () => {
    const b = servico('backup');
    expect(b).toMatch(/^\s+env_file:\n\s+- path: \.env\.backup\n/m);
    // O único arquivo de variáveis citado no serviço (chave e comentários) é o .env.backup, nunca o .env.producao.
    expect(new Set([...b.matchAll(/\.env[\w.]*/g)].map((m) => m[0]))).toEqual(new Set(['.env.backup']));
    const semBackup = b.replaceAll('BACKUP_S3_CHAVE', 'BACKUP_X');
    for (const segredo of ['ML_', 'CHAVE_CRIPTOGRAFIA', 'FOCUS_', 'S3_CHAVE_', 'SEGREDO_LINKS', 'DATABASE_URL']) {
      expect(semBackup).not.toContain(segredo);
    }
  });

  it('web e worker nunca recebem as variáveis BACKUP_* (E20)', () => {
    for (const nome of ['web', 'worker']) {
      const s = servico(nome);
      expect(s).not.toContain('BACKUP_');
      expect(s).not.toContain('.env.backup');
    }
    // web e worker leem o .env.producao inteiro: as BACKUP_* não podem morar nele.
    expect(producaoExemplo).not.toMatch(/BACKUP_/);
  });
});

describe('.env.backup.example (E20)', () => {
  const chaves = backupExemplo
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => l.split('=')[0]);

  it('só tem as variáveis do backup', () => {
    expect(chaves).toEqual([
      'BACKUP_S3_ENDPOINT',
      'BACKUP_S3_REGIAO',
      'BACKUP_S3_BUCKET',
      'BACKUP_S3_CHAVE_ID',
      'BACKUP_S3_CHAVE_SECRETA',
      'BACKUP_SENHA',
    ]);
  });

  it('não traz nenhum segredo do sistema', () => {
    const semBackup = backupExemplo.replaceAll('BACKUP_S3_CHAVE', 'BACKUP_X');
    for (const segredo of ['ML_', 'CHAVE_CRIPTOGRAFIA', 'FOCUS_', 'S3_CHAVE_', 'SEGREDO_LINKS', 'DATABASE_URL', 'POSTGRES_PASSWORD']) {
      expect(semBackup).not.toContain(segredo);
    }
  });

  it('o .env.backup fica fora do git, como o .env.producao', () => {
    expect(gitignore).toMatch(/^\.env\*$/m);
    expect(gitignore).toMatch(/^!\.env\.backup\.example$/m);
    expect(gitignore).not.toMatch(/^!\.env\.backup$/m);
  });
});
