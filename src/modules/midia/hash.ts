import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Lê o arquivo aos pedaços (vídeo de 300 MB com memória constante). */
export async function sha256DoArquivo(caminho: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const parte of createReadStream(caminho)) hash.update(parte as Buffer);
  return hash.digest('hex');
}

export function sha256DoBuffer(conteudo: Buffer): string {
  return createHash('sha256').update(conteudo).digest('hex');
}
