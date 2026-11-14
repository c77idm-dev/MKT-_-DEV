import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIMITE_BATIMENTO_MS, NOME_ARQUIVO_BATIMENTO } from '../src/worker/batimento';

const compose = readFileSync('docker-compose.prod.yml', 'utf8').replaceAll('\r\n', '\n');

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
    for (const nome of ['web', 'worker', 'postgres']) expect(servico(nome)).toMatch(/memory: \d+[mg]/);
  });
  it('ninguém usa a rede do host, modo privilegiado ou nome de container fixo', () => {
    expect(compose).not.toMatch(/network_mode:\s*host|privileged:\s*true|container_name:/);
  });
  it('healthcheck do web no /api/saude e do worker no batimento (decisão 17)', () => {
    expect(servico('web')).toMatch(/healthcheck:[\s\S]*\/api\/saude/);
    expect(servico('worker')).toContain(NOME_ARQUIVO_BATIMENTO);
    expect(servico('worker')).toContain(String(LIMITE_BATIMENTO_MS));
  });
});
