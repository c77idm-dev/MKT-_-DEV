/** Quadro do Vídeo de Prova para o dossiê (extra): em 1 s, ou no meio de um vídeo mais curto, ou no início. */
export function segundoDoQuadro(duracao: number | null): number {
  if (duracao === null || !(duracao > 0)) return 0;
  return Math.min(1, duracao / 2);
}

/** Argumentos do ffmpeg (sem shell, como em midia/ffmpeg.ts): busca antes da entrada (rápido), 1 quadro em JPEG. */
export function argumentosQuadro(entrada: string, saida: string, segundo: number): string[] {
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', segundo.toFixed(3), '-i', entrada,
    '-frames:v', '1', '-q:v', '3', '-f', 'image2', '-c:v', 'mjpeg',
    saida,
  ];
}
