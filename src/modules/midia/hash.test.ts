import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256DoArquivo, sha256DoBuffer } from './hash';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('SHA-256 (spec §9: integridade)', () => {
  it('do buffer e do arquivo lido aos pedaços', async () => {
    expect(sha256DoBuffer(Buffer.from('abc'))).toBe(ABC);
    const pasta = await mkdtemp(join(tmpdir(), 'hash-'));
    try {
      await writeFile(join(pasta, 'a.bin'), 'abc');
      expect(await sha256DoArquivo(join(pasta, 'a.bin'))).toBe(ABC);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
