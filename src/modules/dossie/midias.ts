import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lerEnv } from '@/lib/env';
import { armazenamentoDoProvedor } from '@/modules/midia/armazenamento';
import { LIMITE_FOTO_BYTES } from '@/modules/midia/dominio';
import { ErroArquivoNaoEncontrado } from '@/modules/midia/erros';
import { binariosFfmpeg, executar, sondar, type Binarios } from '@/modules/midia/ffmpeg';
import type { EvidenciaDossie } from './dominio';
import { reduzirImagem, type ImagemPdf } from './imagens';
import type { MidiasDossie, ResultadoFoto, ResultadoQuadro } from './pdf';
import { argumentosQuadro, segundoDoQuadro } from './quadro';

const ARQUIVO_SUMIU = 'Arquivo não encontrado no armazenamento.';
const IMAGEM_ILEGIVEL = 'Não foi possível ler a imagem.';
const VIDEO_SUMIU = 'Arquivo do vídeo não encontrado no armazenamento.';
const VIDEO_ILEGIVEL = 'Não foi possível ler o arquivo do vídeo.';
const SEM_QUADRO = 'Não foi possível tirar um quadro do vídeo.';

/** Prazo para ler cada mídia do armazenamento: um S3 que trava sem dar erro não segura a fila dos dossiês. */
const PRAZO_LEITURA_MS = 60_000;
/** Prazo do ffprobe e do ffmpeg para um quadro só (o worker usa 60 s; aqui o celular está esperando). */
const PRAZO_QUADRO_MS = 15_000;
/** A foto final tem até 15 MB; acima do dobro disso o arquivo não é lido para a memória. */
const LIMITE_LEITURA_FOTO = 2 * LIMITE_FOTO_BYTES;

/** Uma linha JSON por mídia que não entrou no PDF: só o id da evidência e o tipo do erro (nunca a chave nem o caminho). */
function avisar(evento: string, evidenciaId: string, erro: unknown): void {
  const tipo = erro instanceof Error ? erro.name : typeof erro;
  console.warn(JSON.stringify({ em: new Date().toISOString(), nivel: 'aviso', origem: 'web', evento, evidenciaId, erro: tipo }));
}

/** O arquivo não está lá: a chave sumiu do armazenamento ou o disco não achou o arquivo ao abrir. */
function sumiu(erro: unknown): boolean {
  return erro instanceof ErroArquivoNaoEncontrado || (erro as { code?: unknown } | null)?.code === 'ENOENT';
}

/** O prazo da leitura junto com o cancelamento do dossiê (o pedido foi embora ou o dossiê passou do prazo). */
function prazoDaLeitura(ms: number, sinal: AbortSignal | undefined): AbortSignal {
  return sinal ? AbortSignal.any([sinal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
}

/**
 * Lê do armazenamento onde a evidência foi gravada (contrato §10, E15), desistindo quando o prazo acaba (o `ler` do S3
 * pode não responder). Um stream que chegar depois da desistência é fechado.
 */
function abrir(e: EvidenciaDossie, prazo: AbortSignal): Promise<Readable> {
  const { caminho, provedor } = e;
  if (!caminho || !provedor) return Promise.reject(new ErroArquivoNaoEncontrado('(sem arquivo final)'));
  if (prazo.aborted) return Promise.reject(prazo.reason);
  const aberto = Promise.resolve().then(() => armazenamentoDoProvedor(provedor).ler(caminho));
  return new Promise((resolver, rejeitar) => {
    const desistir = () => {
      rejeitar(prazo.reason);
      aberto.then((fluxo) => fluxo.destroy(), () => undefined);
    };
    prazo.addEventListener('abort', desistir, { once: true });
    aberto.then(
      (fluxo) => {
        prazo.removeEventListener('abort', desistir);
        resolver(fluxo);
      },
      (erro: unknown) => {
        prazo.removeEventListener('abort', desistir);
        rejeitar(erro);
      },
    );
  });
}

/**
 * O arquivo inteiro na memória, com limite e prazo. O `for await` rejeita quando o stream dá erro no meio (S3 resetado,
 * EIO no disco) e o sinal destrói o stream que trava. O sharp juntaria tudo na memória de qualquer jeito.
 */
async function lerAteOLimite(fluxo: Readable, limite: number, prazo: AbortSignal): Promise<Buffer> {
  // O listener sai quando a leitura termina: o prazo de cada foto não segura o stream depois.
  const desistir = () => fluxo.destroy(prazo.reason instanceof Error ? prazo.reason : new Error('Prazo da leitura esgotado.'));
  if (prazo.aborted) desistir();
  else prazo.addEventListener('abort', desistir, { once: true });
  try {
    const partes: Buffer[] = [];
    let total = 0;
    for await (const parte of fluxo) {
      const b = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
      total += b.length;
      if (total > limite) {
        fluxo.destroy();
        throw new Error(`Arquivo acima de ${limite} bytes.`);
      }
      partes.push(b);
    }
    return Buffer.concat(partes, total);
  } finally {
    prazo.removeEventListener('abort', desistir);
  }
}

type Video = { quadro: Buffer | null; duracaoSegundos: number | null; sha256Calculado: string | null; problema: string | null };

const semVideo = (problema: string): Video => ({ quadro: null, duracaoSegundos: null, sha256Calculado: null, problema });

/**
 * As mídias do dossiê lidas do armazenamento (disco ou S3), uma por vez. Foto: lida inteira (com limite e prazo) e
 * reduzida pelo sharp. Vídeo: copiado para um arquivo temporário (MIDIA_TMP_DIR), o ffprobe mede a duração e o ffmpeg
 * tira um quadro; a pasta temporária é apagada logo depois. O quadro fica guardado para a 2ª tentativa do PDF.
 * Erro de leitura, prazo estourado ou pasta temporária impossível viram aviso no PDF; só o cancelamento do dossiê
 * (`sinal`) sobe como erro.
 */
export function midiasDoArmazenamento(
  o: { binarios?: Binarios; pastaTemporaria?: string; prazoLeituraMs?: number; limiteFotoBytes?: number } = {},
): MidiasDossie {
  const videos = new Map<string, Promise<Video>>();
  const prazoMs = o.prazoLeituraMs ?? PRAZO_LEITURA_MS;

  async function extrair(e: EvidenciaDossie, sinal: AbortSignal | undefined): Promise<Video> {
    const binarios = o.binarios ?? binariosFfmpeg();
    let pasta: string;
    try {
      const base = o.pastaTemporaria ?? resolve(lerEnv().MIDIA_TMP_DIR, 'dossie');
      await mkdir(base, { recursive: true });
      pasta = await mkdtemp(join(base, 'dossie-'));
    } catch (erro) {
      avisar('dossie_video_sem_pasta', e.id, erro);
      return semVideo(SEM_QUADRO);
    }
    try {
      const arquivo = join(pasta, 'video');
      const hash = e.sha256Final ? null : createHash('sha256');
      const prazo = prazoDaLeitura(prazoMs, sinal);
      let fluxo: Readable;
      try {
        fluxo = await abrir(e, prazo);
      } catch (erro) {
        sinal?.throwIfAborted();
        avisar('dossie_video_indisponivel', e.id, erro);
        return semVideo(sumiu(erro) ? VIDEO_SUMIU : VIDEO_ILEGIVEL);
      }
      try {
        // O pipeline destrói a origem quando algo falha; o hash só vale se a cópia terminou inteira.
        await pipeline(
          fluxo,
          async function* (origem: AsyncIterable<Buffer>) {
            for await (const parte of origem) {
              hash?.update(parte);
              yield parte;
            }
          },
          createWriteStream(arquivo),
          { signal: prazo },
        );
      } catch (erro) {
        sinal?.throwIfAborted();
        avisar('dossie_video_ilegivel', e.id, erro);
        return semVideo(sumiu(erro) ? VIDEO_SUMIU : VIDEO_ILEGIVEL);
      }
      const sha256Calculado = hash ? hash.digest('hex') : null;
      let duracaoSegundos: number | null = null;
      try {
        duracaoSegundos = (await sondar(binarios.ffprobe, arquivo, { limiteMs: PRAZO_QUADRO_MS })).duracao;
      } catch (erro) {
        avisar('dossie_video_sem_duracao', e.id, erro);
      }
      const saida = join(pasta, 'quadro.jpg');
      try {
        const r = await executar(binarios.ffmpeg, argumentosQuadro(arquivo, saida, segundoDoQuadro(duracaoSegundos)), { limiteMs: PRAZO_QUADRO_MS });
        if (r.codigo !== 0) throw new Error(`ffmpeg saiu com o código ${r.codigo}`);
        return { quadro: await readFile(saida), duracaoSegundos, sha256Calculado, problema: null };
      } catch (erro) {
        avisar('dossie_video_sem_quadro', e.id, erro);
        return { quadro: null, duracaoSegundos, sha256Calculado, problema: SEM_QUADRO };
      }
    } finally {
      // Uma falha ao limpar (EBUSY no Windows) não troca o resultado por um erro.
      await rm(pasta, { recursive: true, force: true }).catch((erro: unknown) => avisar('dossie_video_tmp_nao_apagado', e.id, erro));
    }
  }

  return {
    async foto(e, opcoes, sinal): Promise<ResultadoFoto> {
      const prazo = prazoDaLeitura(prazoMs, sinal);
      let conteudo: Buffer;
      try {
        conteudo = await lerAteOLimite(await abrir(e, prazo), o.limiteFotoBytes ?? LIMITE_LEITURA_FOTO, prazo);
      } catch (erro) {
        sinal?.throwIfAborted();
        if (sumiu(erro)) {
          avisar('dossie_foto_indisponivel', e.id, erro);
          return { ok: false, motivo: ARQUIVO_SUMIU };
        }
        avisar('dossie_foto_ilegivel', e.id, erro);
        return { ok: false, motivo: IMAGEM_ILEGIVEL };
      }
      const sha256Calculado = e.sha256Final ? null : createHash('sha256').update(conteudo).digest('hex');
      try {
        return { ok: true, imagem: await reduzirImagem(conteudo, opcoes), sha256Calculado };
      } catch (erro) {
        avisar('dossie_foto_ilegivel', e.id, erro);
        return { ok: false, motivo: IMAGEM_ILEGIVEL };
      }
    },

    async quadroDoVideo(e, opcoes, sinal): Promise<ResultadoQuadro> {
      if (!videos.has(e.id)) videos.set(e.id, extrair(e, sinal));
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
