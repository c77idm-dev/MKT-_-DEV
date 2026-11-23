import sharp from 'sharp';
import { IMAGEM_ANUNCIO, PRAZO_FOTO_ANUNCIO_MS } from './dominio';
import { reduzirImagem, type ImagemPdf } from './imagens';

/**
 * Foto do anúncio no ML no dossiê de provas (extra, aprovada em 23/11): o servidor baixa a imagem do CDN do ML para pôr
 * ao lado do produto esperado. É o único pedido para fora que o dossiê faz, e a URL vem de dado do ML guardado no banco
 * (produtos.foto_url): o host é conferido antes de qualquer rede, sem seguir redirecionamento, sem cookie, sem
 * autenticação, com prazo e teto de tamanho. Qualquer falha vira "indisponível" no PDF, nunca um erro.
 */

/**
 * O host das fotos que a sincronização grava (secure_url e secure_thumbnail do /items: mapeamento.ts e as fixtures).
 * Lista fechada: um host novo do CDN entra por emenda; até lá a foto fica "indisponível" e o log diz o host.
 */
export const HOSTS_FOTO_ANUNCIO: ReadonlySet<string> = new Set(['http2.mlstatic.com']);

/** As fotos do anúncio no ML têm algumas centenas de KB; acima disso o corpo nem é lido até o fim. */
export const LIMITE_BYTES_FOTO_ANUNCIO = 3 * 1024 * 1024;
/** Uma imagem pequena no arquivo mas enorme descomprimida (16 Mpx) não chega ao sharp: o web tem 512 MB. */
const LIMITE_PIXELS_ANUNCIO = 4096 * 4096;
/** O mesmo limite do mapeamento (urlHttps). */
const MAX_URL = 2048;

type FormatoFoto = 'jpeg' | 'png' | 'gif' | 'webp';

/** Só formatos de foto, pela assinatura (o SVG é texto e fica de fora, mesmo que o servidor diga image/png). */
function formatoPelaAssinatura(b: Buffer): FormatoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 6 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export type MotivoFotoAnuncio =
  | 'sem_url'
  | 'host_nao_permitido'
  | 'redirecionamento'
  | 'http'
  | 'nao_e_imagem'
  | 'grande_demais'
  | 'prazo'
  | 'rede'
  | 'imagem_invalida'
  /** Do PDF: passou do teto de fotos ou do tempo das fotos do anúncio, e nem foi pedida. */
  | 'fora_do_limite'
  | 'sem_tempo';

export type ResultadoFotoAnuncio = { ok: true; imagem: ImagemPdf } | { ok: false; motivo: MotivoFotoAnuncio };

/** A URL já interpretada (é ela que vai ao fetch), ou null: só https, no host da lista, sem usuário, senha ou porta. */
export function urlFotoAnuncioPermitida(valor: string): URL | null {
  if (valor.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  return HOSTS_FOTO_ANUNCIO.has(url.hostname) ? url : null;
}

/** Só o host vai ao log (nunca o caminho nem a query). */
function hostDe(valor: string): string | null {
  try {
    return new URL(valor).hostname.slice(0, 120) || null;
  } catch {
    return null;
  }
}

function indisponivel(host: string | null, motivo: MotivoFotoAnuncio, extra: { status?: number } = {}): ResultadoFotoAnuncio {
  console.warn(JSON.stringify({ em: new Date().toISOString(), nivel: 'aviso', origem: 'web', evento: 'dossie_foto_anuncio_indisponivel', host, motivo, ...extra }));
  return { ok: false, motivo };
}

class ErroGrandeDemais extends Error {
  constructor() {
    super('Foto do anúncio acima do limite.');
    this.name = 'ErroGrandeDemais';
  }
}

/**
 * O corpo inteiro na memória, até o limite. Passou do limite: cancela o corpo. O sinal (prazo ou cancelamento do
 * dossiê) também cancela: a leitura pendente termina e o erro do sinal sobe, mesmo com um fetch que não ligue o sinal
 * ao corpo.
 */
async function lerCorpo(corpo: ReadableStream<Uint8Array> | null, limite: number, sinal: AbortSignal): Promise<Buffer> {
  if (!corpo) return Buffer.alloc(0);
  const leitor = corpo.getReader();
  const parar = () => void leitor.cancel(sinal.reason).catch(() => undefined);
  sinal.addEventListener('abort', parar, { once: true });
  try {
    const partes: Buffer[] = [];
    let total = 0;
    for (;;) {
      sinal.throwIfAborted();
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) {
        await leitor.cancel().catch(() => undefined);
        throw new ErroGrandeDemais();
      }
      partes.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    sinal.throwIfAborted();
    return Buffer.concat(partes, total);
  } finally {
    sinal.removeEventListener('abort', parar);
    leitor.releaseLock();
  }
}

/**
 * Baixa a foto do anúncio e a reduz para o PDF (400 px, JPEG). `fetchFn`: injetável nos testes (o e2e e os testes
 * nunca saem para a rede). `sinal`: o cancelamento do dossiê, que sobe como erro; o resto vira { ok: false }.
 */
export async function baixarFotoAnuncio(
  valor: string | null,
  o: { fetchFn?: typeof fetch; prazoMs?: number; sinal?: AbortSignal; limiteBytes?: number } = {},
): Promise<ResultadoFotoAnuncio> {
  if (!valor || valor.trim() === '') return { ok: false, motivo: 'sem_url' };
  const url = urlFotoAnuncioPermitida(valor.trim());
  if (!url) return indisponivel(hostDe(valor.trim()), 'host_nao_permitido');
  o.sinal?.throwIfAborted();
  const host = url.hostname;
  const limite = o.limiteBytes ?? LIMITE_BYTES_FOTO_ANUNCIO;
  const prazo = AbortSignal.timeout(o.prazoMs ?? PRAZO_FOTO_ANUNCIO_MS);
  const sinal = o.sinal ? AbortSignal.any([o.sinal, prazo]) : prazo;

  let conteudo: Buffer;
  try {
    const resposta = await (o.fetchFn ?? fetch)(url.href, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: { accept: 'image/*' },
      signal: sinal,
    });
    const descartar = () => void resposta.body?.cancel().catch(() => undefined);
    // Nada de redirecionamento: nem 3xx (redirect manual) nem um fetch que tenha seguido sozinho para outro host.
    const final = resposta.url ? urlFotoAnuncioPermitida(resposta.url) : url;
    if (resposta.type === 'opaqueredirect' || (resposta.status >= 300 && resposta.status < 400) || resposta.redirected || !final) {
      descartar();
      return indisponivel(host, 'redirecionamento', { status: resposta.status });
    }
    if (!resposta.ok) {
      descartar();
      return indisponivel(host, 'http', { status: resposta.status });
    }
    const tipo = (resposta.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!tipo.startsWith('image/') || tipo === 'image/svg+xml') {
      descartar();
      return indisponivel(host, 'nao_e_imagem');
    }
    const declarado = Number(resposta.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declarado) && declarado > limite) {
      descartar();
      return indisponivel(host, 'grande_demais');
    }
    conteudo = await lerCorpo(resposta.body, limite, sinal);
  } catch (erro) {
    o.sinal?.throwIfAborted();
    if (erro instanceof ErroGrandeDemais) return indisponivel(host, 'grande_demais');
    return indisponivel(host, prazo.aborted ? 'prazo' : 'rede');
  }

  // Pela assinatura dos bytes, antes do sharp: um SVG, PDF ou TIFF disfarçado nem chega a um decodificador.
  const formato = formatoPelaAssinatura(conteudo);
  if (!formato) return indisponivel(host, 'imagem_invalida');
  try {
    const meta = await sharp(conteudo, { failOn: 'error' }).metadata();
    if (meta.format !== formato || !meta.width || !meta.height || meta.width * meta.height > LIMITE_PIXELS_ANUNCIO) {
      return indisponivel(host, 'imagem_invalida');
    }
    return { ok: true, imagem: await reduzirImagem(conteudo, IMAGEM_ANUNCIO) };
  } catch {
    return indisponivel(host, 'imagem_invalida');
  }
}
