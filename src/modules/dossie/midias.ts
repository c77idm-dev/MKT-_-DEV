import { createHash, type Hash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lerEnv } from '@/lib/env';
import { armazenamentoDoProvedor } from '@/modules/midia/armazenamento';
import { binariosFfmpeg, executar, sondar, type Binarios } from '@/modules/midia/ffmpeg';
import type { EvidenciaDossie } from './dominio';
import { reduzirImagem, type ImagemPdf } from './imagens';
import type { MidiasDossie, ResultadoFoto, ResultadoQuadro } from './pdf';
import { argumentosQuadro, segundoDoQuadro } from './quadro';

const ARQUIVO_SUMIU = 'Arquivo não encontrado no armazenamento.';
const IMAGEM_ILEGIVEL = 'Não foi possível ler a imagem.';
const VIDEO_SUMIU = 'Arquivo do vídeo não encontrado no armazenamento.';
const SEM_QUADRO = 'Não foi possível tirar um quadro do vídeo.';

/** Uma linha JSON por mídia que não entrou no PDF: só o id da evidência e o tipo do erro (nunca a chave nem o caminho). */
function avisar(evento: string, evidenciaId: string, erro: unknown): void {
  const tipo = erro instanceof Error ? erro.name : typeof erro;
  console.warn(JSON.stringify({ em: new Date().toISOString(), nivel: 'aviso', origem: 'web', evento, evidenciaId, erro: tipo }));
}

/** Lê do armazenamento onde a evidência foi gravada (contrato §10, E15). */
async function abrir(e: EvidenciaDossie): Promise<Readable> {
  if (!e.caminho || !e.provedor) throw new Error('Evidência sem arquivo final.');
  return armazenamentoDoProvedor(e.provedor).ler(e.caminho);
}

/** Calcula o SHA-256 enquanto o stream passa (só quando o hash final não está guardado). */
function medir(fluxo: Readable, hash: Hash | null): void {
  if (hash) fluxo.on('data', (parte: Buffer) => hash.update(parte));
}

type Video = { quadro: Buffer | null; duracaoSegundos: number | null; sha256Calculado: string | null; problema: string | null };

/**
 * As mídias do dossiê lidas do armazenamento (disco ou S3), uma por vez. Foto: o stream vai direto ao sharp.
 * Vídeo: o stream vai para um arquivo temporário (MIDIA_TMP_DIR), o ffprobe mede a duração e o ffmpeg tira um quadro;
 * a pasta temporária é apagada logo depois. O quadro fica guardado para a 2ª tentativa do PDF (acima de 8 MB).
 */
export function midiasDoArmazenamento(o: { binarios?: Binarios; pastaTemporaria?: string } = {}): MidiasDossie {
  const videos = new Map<string, Promise<Video>>();

  async function extrair(e: EvidenciaDossie): Promise<Video> {
    const binarios = o.binarios ?? binariosFfmpeg();
    const base = o.pastaTemporaria ?? resolve(lerEnv().MIDIA_TMP_DIR, 'dossie');
    await mkdir(base, { recursive: true });
    const pasta = await mkdtemp(join(base, 'dossie-'));
    try {
      const arquivo = join(pasta, 'video');
      const hash = e.sha256Final ? null : createHash('sha256');
      let fluxo: Readable;
      try {
        fluxo = await abrir(e);
      } catch (erro) {
        avisar('dossie_video_indisponivel', e.id, erro);
        return { quadro: null, duracaoSegundos: null, sha256Calculado: null, problema: VIDEO_SUMIU };
      }
      medir(fluxo, hash);
      await pipeline(fluxo, createWriteStream(arquivo));
      const sha256Calculado = hash ? hash.digest('hex') : null;
      let duracaoSegundos: number | null = null;
      try {
        duracaoSegundos = (await sondar(binarios.ffprobe, arquivo)).duracao;
      } catch (erro) {
        avisar('dossie_video_sem_duracao', e.id, erro);
      }
      const saida = join(pasta, 'quadro.jpg');
      try {
        const r = await executar(binarios.ffmpeg, argumentosQuadro(arquivo, saida, segundoDoQuadro(duracaoSegundos)), { limiteMs: 60_000 });
        if (r.codigo !== 0) throw new Error(`ffmpeg saiu com o código ${r.codigo}`);
        return { quadro: await readFile(saida), duracaoSegundos, sha256Calculado, problema: null };
      } catch (erro) {
        avisar('dossie_video_sem_quadro', e.id, erro);
        return { quadro: null, duracaoSegundos, sha256Calculado, problema: SEM_QUADRO };
      }
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  }

  return {
    async foto(e, opcoes): Promise<ResultadoFoto> {
      let fluxo: Readable;
      try {
        fluxo = await abrir(e);
      } catch (erro) {
        avisar('dossie_foto_indisponivel', e.id, erro);
        return { ok: false, motivo: ARQUIVO_SUMIU };
      }
      const hash = e.sha256Final ? null : createHash('sha256');
      medir(fluxo, hash);
      try {
        const imagem = await reduzirImagem(fluxo, opcoes);
        return { ok: true, imagem, sha256Calculado: hash ? hash.digest('hex') : null };
      } catch (erro) {
        fluxo.destroy();
        avisar('dossie_foto_ilegivel', e.id, erro);
        return { ok: false, motivo: IMAGEM_ILEGIVEL };
      }
    },

    async quadroDoVideo(e, opcoes): Promise<ResultadoQuadro> {
      if (!videos.has(e.id)) videos.set(e.id, extrair(e));
      const v = await videos.get(e.id)!;
      let imagem: ImagemPdf | null = null;
      let problema = v.problema;
      if (v.quadro) {
        try {
          imagem = await reduzirImagem(v.quadro, opcoes);
        } catch (erro) {
          avisar('dossie_video_sem_quadro', e.id, erro);
          problema = SEM_QUADRO;
        }
      }
      return { imagem, duracaoSegundos: v.duracaoSegundos, sha256Calculado: v.sha256Calculado, problema };
    },
  };
}
