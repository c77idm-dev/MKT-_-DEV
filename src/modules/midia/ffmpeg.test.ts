import { describe, expect, it } from 'vitest';
import { argumentosTranscodificacao, conferirTranscodificacao, FILTRO_720P, interpretarSondagem } from './ffmpeg';

describe('argumentos do ffmpeg (pesquisa §6.2)', () => {
  it('H.264 High, veryfast, CRF 28, até 1500 kbps, AAC 96 kbps, faststart, sem ler a entrada padrão', () => {
    const a = argumentosTranscodificacao('C:/tmp/entrada', 'C:/tmp/saida.parcial');
    expect(a.slice(0, 7)).toEqual(['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', 'C:/tmp/entrada']);
    expect(a).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1500k', '-c:a', 'aac', '-b:a', '96k']));
    expect(a).toEqual(expect.arrayContaining(['-movflags', '+faststart']));
    expect(a[a.indexOf('-vf') + 1]).toBe(FILTRO_720P);
    expect(a.slice(-3)).toEqual(['-f', 'mp4', 'C:/tmp/saida.parcial']);
  });

  it('o lado menor fica em até 720 px, par, sem ampliar vídeo pequeno', () => {
    expect(FILTRO_720P).toContain('min(720,ih)');
    expect(FILTRO_720P).toContain('min(720,iw)');
    expect(FILTRO_720P).toContain('format=yuv420p');
  });
});

describe('ffprobe', () => {
  it('lê duração, codec e tamanho do JSON', () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: 'audio', codec_name: 'aac' },
        { codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080 },
      ],
      format: { duration: '61.500000' },
    });
    expect(interpretarSondagem(json)).toEqual({ duracao: 61.5, codecVideo: 'hevc', largura: 1920, altura: 1080 });
    expect(interpretarSondagem('{}')).toEqual({ duracao: null, codecVideo: null, largura: null, altura: null });
  });

  it('confere a saída antes de apagar o original (spec §9)', () => {
    const antes = { duracao: 60, codecVideo: 'hevc', largura: 1920, altura: 1080 };
    expect(conferirTranscodificacao(antes, { duracao: 59.8, codecVideo: 'h264', largura: 1280, altura: 720 })).toBeNull();
    expect(conferirTranscodificacao(antes, { duracao: 30, codecVideo: 'h264', largura: 1280, altura: 720 })).toMatch(/Duração diferente/);
    expect(conferirTranscodificacao(antes, { duracao: 60, codecVideo: null, largura: null, altura: null })).toMatch(/não é H\.264/);
    expect(conferirTranscodificacao({ ...antes, duracao: null }, { duracao: 5, codecVideo: 'h264', largura: 1, altura: 1 })).toBeNull();
  });
});
