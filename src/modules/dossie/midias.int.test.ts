import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import type { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { binariosFfmpeg, temFfmpeg } from '@/modules/midia/ffmpeg';
import { jpegTeste } from '../../../tests/helpers/fabricas-dossie-banco';
import { IMAGEM_PADRAO, type EvidenciaDossie } from './dominio';
import { midiasDoArmazenamento } from './midias';

const comFfmpeg = await temFfmpeg();
let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'dossie-midias-'));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

let n = 0;
async function guardada(conteudo: Buffer, p: Partial<EvidenciaDossie> = {}): Promise<EvidenciaDossie> {
  n += 1;
  const video = p.tipo === 'VIDEO_PROVA';
  const caminho = `evidencias/dev-${n}/ev-${n}.${video ? 'mp4' : 'jpg'}`;
  await obterArmazenamento().salvar(caminho, Readable.from([conteudo]));
  return {
    id: `ev-${n}`,
    tipo: 'FOTO_1_ETIQUETA',
    itemId: null,
    situacao: 'PRONTA',
    tipoConteudo: video ? 'video/mp4' : 'image/jpeg',
    caminho,
    provedor: 'disco',
    enviadoEm: new Date(),
    enviadoPorNome: 'Operador',
    processadoEm: new Date(),
    tamanho: conteudo.length,
    sha256Original: 'a'.repeat(64),
    sha256Final: createHash('sha256').update(conteudo).digest('hex'),
    ...p,
  };
}

describe('midiasDoArmazenamento: fotos (extra)', () => {
  it('lê a foto pelo provedor dela e entrega reduzida; o hash guardado não é recalculado', async () => {
    const e = await guardada(await jpegTeste({ r: 10, g: 120, b: 200 }, 2000, 1500));
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect({ largura: r.imagem.largura, altura: r.imagem.altura }).toEqual({ largura: 1280, altura: 960 });
    expect((await sharp(r.imagem.jpeg).metadata()).format).toBe('jpeg');
    expect(r.sha256Calculado).toBeNull();
  });

  it('sem o hash final guardado: calcula o SHA-256 do arquivo lido', async () => {
    const conteudo = await jpegTeste({ r: 10, g: 20, b: 30 });
    const e = await guardada(conteudo, { sha256Final: null });
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO);
    expect(r).toMatchObject({ ok: true, sha256Calculado: createHash('sha256').update(conteudo).digest('hex') });
  });

  it('arquivo sumido do armazenamento: aviso, sem a chave no texto', async () => {
    const e = await guardada(await jpegTeste({ r: 1, g: 2, b: 3 }));
    await (obterArmazenamento() as ArmazenamentoMemoria).apagar(e.caminho!);
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO);
    expect(r).toEqual({ ok: false, motivo: 'Arquivo não encontrado no armazenamento.' });
  });

  it('arquivo que não é imagem: aviso', async () => {
    const e = await guardada(Buffer.from('não sou uma foto'));
    expect(await midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO)).toEqual({ ok: false, motivo: 'Não foi possível ler a imagem.' });
  });
});

describe('midiasDoArmazenamento: vídeo (extra)', () => {
  it('vídeo que não é vídeo: sem quadro e sem duração, com aviso; a pasta temporária fica vazia', async () => {
    const e = await guardada(Buffer.from('bytes quaisquer'), { tipo: 'VIDEO_PROVA' });
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta }).quadroDoVideo(e, IMAGEM_PADRAO);
    expect(r).toMatchObject({ imagem: null, duracaoSegundos: null, problema: 'Não foi possível tirar um quadro do vídeo.' });
    expect(await readdir(pasta)).toEqual([]);
  });

  it('vídeo sumido do armazenamento: aviso', async () => {
    const e = await guardada(Buffer.from('x'), { tipo: 'VIDEO_PROVA' });
    await (obterArmazenamento() as ArmazenamentoMemoria).apagar(e.caminho!);
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta }).quadroDoVideo(e, IMAGEM_PADRAO);
    expect(r).toMatchObject({ imagem: null, problema: 'Arquivo do vídeo não encontrado no armazenamento.' });
  });

  it.skipIf(!comFfmpeg)('vídeo de verdade (precisa do ffmpeg): um quadro reduzido e a duração; a 2ª tentativa reusa o quadro', async () => {
    const origem = join(pasta, '..', `video-${Date.now()}.mp4`);
    execFileSync(
      binariosFfmpeg().ffmpeg,
      ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4', origem],
      { stdio: 'ignore' },
    );
    const conteudo = await readFile(origem);
    await rm(origem, { force: true });
    const e = await guardada(conteudo, { tipo: 'VIDEO_PROVA', sha256Final: null });
    const midias = midiasDoArmazenamento({ pastaTemporaria: pasta });
    const r = await midias.quadroDoVideo(e, IMAGEM_PADRAO);
    expect(r.problema).toBeNull();
    expect(r.imagem).not.toBeNull();
    expect(r.imagem!.largura).toBe(640);
    expect(r.duracaoSegundos).toBeCloseTo(2, 0);
    expect(r.sha256Calculado).toBe(createHash('sha256').update(conteudo).digest('hex'));
    expect(await readdir(pasta)).toEqual([]);
    // Na 2ª tentativa (PDF acima de 8 MB) o quadro já extraído é reusado: nem precisa do arquivo de novo.
    await (obterArmazenamento() as ArmazenamentoMemoria).apagar(e.caminho!);
    const segunda = await midias.quadroDoVideo(e, { ladoMaior: 320, qualidade: 60 });
    expect(segunda.imagem!.largura).toBe(320);
  });
});
