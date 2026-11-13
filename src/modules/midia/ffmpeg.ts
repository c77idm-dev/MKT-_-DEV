import { spawn } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { lerEnv } from '@/lib/env';

export type Binarios = { ffmpeg: string; ffprobe: string };

/** FFMPEG_PATH e FFPROBE_PATH (padrão: no PATH). No Windows: winget install Gyan.FFmpeg. */
export function binariosFfmpeg(): Binarios {
  const env = lerEnv();
  return { ffmpeg: env.FFMPEG_PATH, ffprobe: env.FFPROBE_PATH };
}

/**
 * Lado menor em até 720 px (deitado 1280×720, em pé 720×1280), sempre par e sem ampliar vídeo menor. As aspas simples
 * protegem as vírgulas dentro do if() no filtro do ffmpeg (sem shell: o ffmpeg recebe o texto como está).
 */
export const FILTRO_720P =
  "scale='if(gt(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gt(iw,ih),trunc(min(720,ih)/2)*2,-2)',format=yuv420p";

export function argumentosTranscodificacao(entrada: string, saida: string): string[] {
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', entrada,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', FILTRO_720P,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1500k', '-bufsize', '3000k', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
    '-movflags', '+faststart',
    '-f', 'mp4',
    saida,
  ];
}

export type Sondagem = { duracao: number | null; codecVideo: string | null; largura: number | null; altura: number | null };

type SaidaFfprobe = {
  streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[];
  format?: { duration?: string };
};

export function interpretarSondagem(json: string): Sondagem {
  const d = JSON.parse(json) as SaidaFfprobe;
  const video = d.streams?.find((s) => s.codec_type === 'video');
  const duracao = Number(d.format?.duration);
  return {
    duracao: d.format?.duration !== undefined && Number.isFinite(duracao) ? duracao : null,
    codecVideo: video?.codec_name ?? null,
    largura: video?.width ?? null,
    altura: video?.height ?? null,
  };
}

/** Decisão 7: H.264 e duração dentro de 5% (ou 1 s). null = saída aceita. */
export function conferirTranscodificacao(antes: Sondagem, depois: Sondagem): string | null {
  if (depois.codecVideo !== 'h264') return `O vídeo convertido não é H.264 (${depois.codecVideo ?? 'sem trilha de vídeo'}).`;
  if (antes.duracao !== null && depois.duracao !== null) {
    const tolerancia = Math.max(1, antes.duracao * 0.05);
    if (Math.abs(antes.duracao - depois.duracao) > tolerancia) {
      return `Duração diferente depois da conversão (${antes.duracao.toFixed(1)} s → ${depois.duracao.toFixed(1)} s).`;
    }
  }
  return null;
}

export type Execucao = { codigo: number | null; stdout: string; stderr: string };

/** spawn sem shell, argumentos em lista, prazo com SIGKILL e saídas limitadas (pesquisa §6.5). */
export function executar(binario: string, argumentos: string[], opcoes: { limiteMs: number }): Promise<Execucao> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(binario, argumentos, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (parte: Buffer) => {
      if (stdout.length < 1_000_000) stdout += parte.toString();
    });
    filho.stderr.on('data', (parte: Buffer) => {
      stderr = (stderr + parte.toString()).slice(-8000);
    });
    const relogio = setTimeout(() => filho.kill('SIGKILL'), opcoes.limiteMs);
    filho.on('error', (erro) => {
      clearTimeout(relogio);
      rejeitar(erro);
    });
    filho.on('close', (codigo) => {
      clearTimeout(relogio);
      resolver({ codigo, stdout, stderr });
    });
  });
}

export async function sondar(ffprobe: string, arquivo: string): Promise<Sondagem> {
  const r = await executar(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', arquivo], { limiteMs: 60_000 });
  if (r.codigo !== 0) throw new Error(`ffprobe falhou: ${r.stderr.trim() || `código ${r.codigo}`}`);
  return interpretarSondagem(r.stdout);
}

/** Grava num arquivo parcial e renomeia: um vídeo pela metade nunca vira a saída. Prazo de 50 min (a tarefa expira em 60). */
export async function transcodificar(ffmpeg: string, entrada: string, saida: string): Promise<void> {
  const parcial = `${saida}.parcial`;
  const r = await executar(ffmpeg, argumentosTranscodificacao(entrada, parcial), { limiteMs: 50 * 60_000 });
  if (r.codigo !== 0) {
    await rm(parcial, { force: true });
    throw new Error(`ffmpeg falhou: ${r.stderr.trim() || `código ${r.codigo}`}`);
  }
  await rename(parcial, saida);
}

export async function temFfmpeg(binarios: Binarios = binariosFfmpeg()): Promise<boolean> {
  try {
    return (await executar(binarios.ffmpeg, ['-version'], { limiteMs: 10_000 })).codigo === 0;
  } catch {
    return false;
  }
}
