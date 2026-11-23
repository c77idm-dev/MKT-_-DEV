import { describe, expect, it } from 'vitest';
import { argumentosQuadro, segundoDoQuadro } from './quadro';

describe('quadro do Vídeo de Prova (dossiê)', () => {
  it('pega o quadro em 1 s, ou no meio do vídeo curto, ou no início sem duração', () => {
    expect(segundoDoQuadro(42)).toBe(1);
    expect(segundoDoQuadro(1.2)).toBeCloseTo(0.6);
    expect(segundoDoQuadro(null)).toBe(0);
    expect(segundoDoQuadro(0)).toBe(0);
  });

  it('ffmpeg sem shell: busca antes da entrada, 1 quadro, JPEG', () => {
    expect(argumentosQuadro('/tmp/v.mp4', '/tmp/q.jpg', 1)).toEqual([
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '1.000', '-i', '/tmp/v.mp4',
      '-frames:v', '1', '-q:v', '3', '-f', 'image2', '-c:v', 'mjpeg',
      '/tmp/q.jpg',
    ]);
  });
});
