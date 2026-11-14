import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lerEnv } from '@/lib/env';

/** Onde o tus grava os uploads em andamento (fora da interface de armazenamento, contrato §5.2). */
export function pastaTus(): string {
  return resolve(lerEnv().MIDIA_TMP_DIR, 'tus');
}

/** Apaga o arquivo do upload e o .json que o tus grava ao lado. Não reclama se já não existe. */
export async function apagarTemporario(caminho: string): Promise<void> {
  await rm(caminho, { force: true });
  await rm(`${caminho}.json`, { force: true });
}
