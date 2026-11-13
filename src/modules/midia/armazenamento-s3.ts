import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ArmazenamentoArquivos } from './armazenamento';
import { validarChave } from './chaves';
import { ErroArquivoNaoEncontrado } from './erros';

export type ConfigS3 = { endpoint: string; regiao: string; bucket: string; chaveId: string; chaveSecreta: string };

/**
 * B2 e R2 falam a API do S3. Checksums só quando exigidos: as versões novas do SDK mandam CRC32 por padrão,
 * e alguns serviços compatíveis recusam (pesquisa §7.2). Caminho no estilo /bucket/chave, aceito pelos dois.
 */
export function criarClienteS3(c: ConfigS3): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.regiao,
    credentials: { accessKeyId: c.chaveId, secretAccessKey: c.chaveSecreta },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** Conteúdo sem tamanho conhecido (XML, PDF) é juntado em memória; mídia grande sempre chega com o tamanho. */
const LIMITE_SEM_TAMANHO = 50 * 1024 * 1024;

async function lerTudo(conteudo: Readable): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of conteudo) {
    const b = Buffer.from(parte);
    total += b.length;
    if (total > LIMITE_SEM_TAMANHO) throw new Error('Arquivo grande demais para gravar sem o tamanho.');
    partes.push(b);
  }
  return Buffer.concat(partes);
}

function naoExiste(erro: unknown): boolean {
  const e = erro as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

export class ArmazenamentoS3 implements ArmazenamentoArquivos {
  readonly provedor = 's3';

  constructor(
    private readonly cliente: S3Client,
    private readonly bucket: string,
  ) {}

  async salvar(chave: string, conteudo: Readable, opcoes: { tipoConteudo?: string; tamanho?: number } = {}): Promise<void> {
    validarChave(chave);
    const corpo = opcoes.tamanho === undefined ? await lerTudo(conteudo) : conteudo;
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: corpo,
        ContentType: opcoes.tipoConteudo,
        ContentLength: opcoes.tamanho ?? (corpo as Buffer).length,
      }),
    );
  }

  async ler(chave: string): Promise<Readable> {
    validarChave(chave);
    try {
      const r = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
      if (!r.Body) throw new ErroArquivoNaoEncontrado(chave);
      return r.Body as unknown as Readable;
    } catch (erro) {
      if (naoExiste(erro)) throw new ErroArquivoNaoEncontrado(chave);
      throw erro;
    }
  }

  /** Link assinado (presigned GET): o navegador baixa direto do B2/R2, sem passar pela VPS. */
  async urlTemporaria(chave: string, segundos: number): Promise<string> {
    validarChave(chave);
    return getSignedUrl(this.cliente, new GetObjectCommand({ Bucket: this.bucket, Key: chave }), { expiresIn: segundos });
  }

  async apagar(chave: string): Promise<void> {
    validarChave(chave);
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }

  async existe(chave: string): Promise<boolean> {
    validarChave(chave);
    try {
      await this.cliente.send(new HeadObjectCommand({ Bucket: this.bucket, Key: chave }));
      return true;
    } catch (erro) {
      if (naoExiste(erro)) return false;
      throw erro;
    }
  }
}
