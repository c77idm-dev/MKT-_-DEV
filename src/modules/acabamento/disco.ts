import { statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lerEnv } from '@/lib/env';
import type { UsoDisco } from './alertas-regras';

/** (extra) Uso do disco da pasta de mídia. Devolve null se não der para ler (no PC a pasta pode nem existir). */
export async function usoDiscoMidia(): Promise<UsoDisco | null> {
  try {
    const s = await statfs(resolve(lerEnv().MIDIA_DIR));
    return { totalBytes: Number(s.bsize) * Number(s.blocks), livreBytes: Number(s.bsize) * Number(s.bavail) };
  } catch {
    return null;
  }
}
