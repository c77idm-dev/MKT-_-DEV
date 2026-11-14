import { statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const NOME_ARQUIVO_BATIMENTO = 'devolucoes-worker-vivo';
export const ARQUIVO_BATIMENTO = join(tmpdir(), NOME_ARQUIVO_BATIMENTO);
export const INTERVALO_BATIMENTO_MS = 30_000;
export const LIMITE_BATIMENTO_MS = 120_000;

/** Grava o arquivo de batimento agora e a cada intervalo (healthcheck do worker). Devolve a função que para. */
export function iniciarBatimento(caminho: string = ARQUIVO_BATIMENTO, intervaloMs: number = INTERVALO_BATIMENTO_MS): () => void {
  const bater = () => {
    try {
      writeFileSync(caminho, new Date().toISOString());
    } catch (erro) {
      console.error('Falha ao gravar o batimento do worker:', erro instanceof Error ? erro.message : 'erro desconhecido');
    }
  };
  bater();
  const relogio = setInterval(bater, intervaloMs);
  relogio.unref();
  return () => clearInterval(relogio);
}

export function batimentoRecente(caminho: string, agoraMs: number, limiteMs: number = LIMITE_BATIMENTO_MS): boolean {
  try {
    return agoraMs - statSync(caminho).mtimeMs < limiteMs;
  } catch {
    return false;
  }
}
