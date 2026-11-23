import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import type { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { binariosFfmpeg, temFfmpeg } from '@/modules/midia/ffmpeg';
import { dadosDossieTeste } from '../../../tests/helpers/fabricas-dossie';
import { jpegTeste } from '../../../tests/helpers/fabricas-dossie-banco';
import { textoDoPdf } from '../../../tests/helpers/pdf';
import { IMAGEM_PADRAO, type EvidenciaDossie } from './dominio';
import { midiasDoArmazenamento } from './midias';
import { gerarPdfDossie } from './pdf';
import { criarSerie } from './serie';

const comFfmpeg = await temFfmpeg();
let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'dossie-midias-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(pasta, { recursive: true, force: true });
});

/** Stream que manda alguns bytes e quebra no meio (conexão do S3 resetada, erro de disco). */
function fluxoQueQuebra(): Readable {
  let enviados = 0;
  return new Readable({
    read() {
      enviados += 1;
      if (enviados === 1) this.push(Buffer.alloc(1024, 1));
      else this.destroy(new Error('aborted'));
    },
  });
}

/** Stream que nunca manda nada nem dá erro (S3 travado). */
function fluxoParado(): Readable {
  return new Readable({ read() {} });
}

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

  it('stream que quebra no meio da leitura: aviso, sem pendurar; a próxima tarefa da fila roda', async () => {
    const e = await guardada(await jpegTeste({ r: 9, g: 9, b: 9 }));
    vi.spyOn(obterArmazenamento(), 'ler').mockResolvedValueOnce(fluxoQueQuebra());
    const emSerie = criarSerie();
    const primeira = emSerie(() => midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO));
    const segunda = emSerie(async () => 'próxima');
    await expect(primeira).resolves.toEqual({ ok: false, motivo: 'Não foi possível ler a imagem.' });
    await expect(segunda).resolves.toBe('próxima');
  });

  it('disco: o arquivo passou no stat mas não abre (sumiu, permissão): aviso', async () => {
    const e = await guardada(await jpegTeste({ r: 8, g: 8, b: 8 }));
    vi.spyOn(obterArmazenamento(), 'ler').mockResolvedValueOnce(createReadStream(join(pasta, 'nao-existe.jpg')));
    expect(await midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO)).toEqual({
      ok: false,
      motivo: 'Arquivo não encontrado no armazenamento.',
    });
  });

  it('armazenamento travado (sem erro nem dados, ou sem responder): desiste no prazo, com aviso', async () => {
    const e = await guardada(await jpegTeste({ r: 7, g: 7, b: 7 }));
    const midias = midiasDoArmazenamento({ pastaTemporaria: pasta, prazoLeituraMs: 50 });
    const parado = fluxoParado();
    vi.spyOn(obterArmazenamento(), 'ler').mockResolvedValueOnce(parado);
    expect(await midias.foto(e, IMAGEM_PADRAO)).toEqual({ ok: false, motivo: 'Não foi possível ler a imagem.' });
    expect(parado.destroyed).toBe(true);
    vi.spyOn(obterArmazenamento(), 'ler').mockReturnValueOnce(new Promise<Readable>(() => undefined));
    expect(await midias.foto(e, IMAGEM_PADRAO)).toEqual({ ok: false, motivo: 'Não foi possível ler a imagem.' });
  });

  it('arquivo maior que o limite de leitura: aviso (não junta tudo na memória)', async () => {
    const e = await guardada(Buffer.alloc(4096, 1));
    expect(await midiasDoArmazenamento({ pastaTemporaria: pasta, limiteFotoBytes: 1024 }).foto(e, IMAGEM_PADRAO)).toEqual({
      ok: false,
      motivo: 'Não foi possível ler a imagem.',
    });
  });

  it('dossiê cancelado (o pedido foi embora): a leitura para e o erro sobe, sem virar aviso', async () => {
    const e = await guardada(await jpegTeste({ r: 6, g: 6, b: 6 }));
    const controle = new AbortController();
    const parado = fluxoParado();
    vi.spyOn(obterArmazenamento(), 'ler').mockResolvedValueOnce(parado);
    const pedido = midiasDoArmazenamento({ pastaTemporaria: pasta }).foto(e, IMAGEM_PADRAO, controle.signal);
    controle.abort();
    await expect(pedido).rejects.toThrow();
    expect(parado.destroyed).toBe(true);
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

  it('stream que quebra no meio da cópia: aviso no lugar do quadro, sem hash parcial; a pasta temporária fica vazia', async () => {
    const e = await guardada(Buffer.from('x'), { tipo: 'VIDEO_PROVA', sha256Final: null });
    vi.spyOn(obterArmazenamento(), 'ler').mockResolvedValueOnce(fluxoQueQuebra());
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta }).quadroDoVideo(e, IMAGEM_PADRAO);
    expect(r).toEqual({ imagem: null, duracaoSegundos: null, sha256Calculado: null, problema: 'Não foi possível ler o arquivo do vídeo.' });
    expect(await readdir(pasta)).toEqual([]);
  });

  it('cópia travada: desiste no prazo, com aviso', async () => {
    const e = await guardada(Buffer.from('x'), { tipo: 'VIDEO_PROVA' });
    vi.spyOn(obterArmazenamento(), 'ler').mockResolvedValueOnce(fluxoParado());
    const r = await midiasDoArmazenamento({ pastaTemporaria: pasta, prazoLeituraMs: 50 }).quadroDoVideo(e, IMAGEM_PADRAO);
    expect(r).toMatchObject({ imagem: null, problema: 'Não foi possível ler o arquivo do vídeo.' });
    expect(await readdir(pasta)).toEqual([]);
  });

  it('pasta temporária que não pode ser criada (disco cheio, permissão): aviso no lugar do quadro, sem erro', async () => {
    const e = await guardada(Buffer.from('x'), { tipo: 'VIDEO_PROVA' });
    await writeFile(join(pasta, 'arquivo'), 'não sou pasta');
    const r = await midiasDoArmazenamento({ pastaTemporaria: join(pasta, 'arquivo', 'sub') }).quadroDoVideo(e, IMAGEM_PADRAO);
    expect(r).toEqual({ imagem: null, duracaoSegundos: null, sha256Calculado: null, problema: 'Não foi possível tirar um quadro do vídeo.' });
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

describe('midiasDoArmazenamento: foto do anúncio no ML (extra)', () => {
  it('baixa pelo fetch dado (os testes nunca saem para a rede), a 400 px, com o prazo pedido; host fora da lista nem chama', async () => {
    const jpeg = await jpegTeste({ r: 200, g: 60, b: 40 }, 1200, 1200);
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } }));
    const midias = midiasDoArmazenamento({ pastaTemporaria: pasta, fetchFn });
    const r = await midias.fotoDoAnuncio('https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg', { prazoMs: 1_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect({ largura: r.imagem.largura, altura: r.imagem.altura }).toEqual({ largura: 400, altura: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1]?.redirect).toBe('manual');

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // O domínio das fotos do ML falso (e2e) não está na lista: "indisponível" sem pedido nenhum.
    expect(await midias.fotoDoAnuncio('https://imagens.ml-falso.example/mlf-fone-01.png', { prazoMs: 1_000 })).toEqual({ ok: false, motivo: 'host_nao_permitido' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('no PDF, com o tempo das fotos do anúncio pela metade e o CDN falhando aos poucos: o dossiê sai, com "indisponível"', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Cada pedido leva uns 15 ms e falha: a 2ª foto recebe o resto do tempo, com fração de ms (uns 3984,7).
    const fetchFn = vi.fn<typeof fetch>(async () => {
      await new Promise((r) => setTimeout(r, 15));
      throw new TypeError('fetch failed');
    });
    const dados = dadosDossieTeste({ evidencias: [] });
    const fotos = ['https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg', 'https://http2.mlstatic.com/D_622222-MLB70000000002_072026-O.jpg'];
    dados.unidades = dados.unidades.map((u, i) => ({ ...u, fotoUrl: fotos[i === 2 ? 1 : 0] }));
    const r = await gerarPdfDossie(dados, midiasDoArmazenamento({ pastaTemporaria: pasta, fetchFn }), { orcamentoAnunciosMs: 4_000 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect((await textoDoPdf(r.bytes)).replace(/\s+/g, ' ').match(/Foto do anúncio indisponível/g)).toHaveLength(3);
  });
});
