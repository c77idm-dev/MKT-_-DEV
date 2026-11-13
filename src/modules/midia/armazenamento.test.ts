import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ArmazenamentoArquivos, definirArmazenamentoParaTestes, provedorAtual } from './armazenamento';
import { ArmazenamentoDisco } from './armazenamento-disco';
import { ArmazenamentoMemoria } from './armazenamento-memoria';
import { ErroArquivoNaoEncontrado, ErroChaveInvalida } from './erros';
import { verificarLink } from './links';

const SEGREDO = 's'.repeat(32);
let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'midia-'));
});
afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

async function texto(r: Readable): Promise<string> {
  const partes: Buffer[] = [];
  for await (const parte of r) partes.push(Buffer.from(parte));
  return Buffer.concat(partes).toString('utf8');
}

const CASOS: [string, () => ArmazenamentoArquivos][] = [
  ['disco', () => new ArmazenamentoDisco(raiz, SEGREDO)],
  ['memória', () => new ArmazenamentoMemoria()],
];

describe.each(CASOS)('ArmazenamentoArquivos (%s)', (_nome, criar) => {
  it('salva, lê, confere e apaga (apagar de novo não é erro)', async () => {
    const a = criar();
    await a.salvar('evidencias/d1/e1.jpg', Readable.from([Buffer.from('ola')]), { tipoConteudo: 'image/jpeg', tamanho: 3 });
    expect(await a.existe('evidencias/d1/e1.jpg')).toBe(true);
    expect(await texto(await a.ler('evidencias/d1/e1.jpg'))).toBe('ola');
    await a.apagar('evidencias/d1/e1.jpg');
    expect(await a.existe('evidencias/d1/e1.jpg')).toBe(false);
    await a.apagar('evidencias/d1/e1.jpg');
  });

  it('ler o que não existe lança ErroArquivoNaoEncontrado', async () => {
    await expect(criar().ler('evidencias/x/y.jpg')).rejects.toThrow(ErroArquivoNaoEncontrado);
  });

  it('recusa chave perigosa', async () => {
    await expect(criar().salvar('../fora.txt', Readable.from([Buffer.from('x')]))).rejects.toThrow(ErroChaveInvalida);
  });
});

describe('ArmazenamentoDisco', () => {
  it('o link temporário aponta para /api/arquivos e vale pelo tempo pedido', async () => {
    const agora = new Date('2026-11-12T12:00:00Z');
    const a = new ArmazenamentoDisco(raiz, SEGREDO, () => agora);
    const url = new URL(await a.urlTemporaria('evidencias/d1/e1.jpg', 600), 'http://localhost');
    expect(url.pathname).toBe('/api/arquivos');
    const p = url.searchParams;
    expect(verificarLink(SEGREDO, { c: p.get('c'), exp: p.get('exp'), sig: p.get('sig') }, agora)).toEqual({
      ok: true,
      caminho: 'evidencias/d1/e1.jpg',
      expiraEm: agora.getTime() / 1000 + 600,
    });
  });

  it('grava de forma atômica: não sobra arquivo parcial', async () => {
    const a = new ArmazenamentoDisco(raiz, SEGREDO);
    await a.salvar('evidencias/d1/e2.mp4', Readable.from([Buffer.from('video')]));
    expect(await readdir(join(raiz, 'evidencias', 'd1'))).toEqual(['e2.mp4']);
  });
});

describe('provedorAtual com o armazenamento dos testes', () => {
  afterEach(() => definirArmazenamentoParaTestes(null));

  it('devolve o provedor do próprio falso instalado', () => {
    definirArmazenamentoParaTestes(new ArmazenamentoDisco(raiz, SEGREDO));
    expect(provedorAtual()).toBe('disco');
    definirArmazenamentoParaTestes(new ArmazenamentoMemoria());
    expect(provedorAtual()).toBe('memoria');
  });
});
