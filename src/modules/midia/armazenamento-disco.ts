import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ArmazenamentoArquivos } from './armazenamento';
import { validarChave } from './chaves';
import { ErroArquivoNaoEncontrado, ErroChaveInvalida } from './erros';
import { assinarLink } from './links';

/** Arquivos em MIDIA_DIR. O link temporário passa pela rota /api/arquivos, que exige sessão e assinatura válida. */
export class ArmazenamentoDisco implements ArmazenamentoArquivos {
  readonly provedor = 'disco';
  private readonly raiz: string;

  constructor(
    raiz: string,
    private readonly segredo: string,
    private readonly relogio: () => Date = () => new Date(),
  ) {
    this.raiz = resolve(raiz);
  }

  caminhoAbsoluto(chave: string): string {
    validarChave(chave);
    const absoluto = resolve(this.raiz, chave);
    if (!absoluto.startsWith(this.raiz + sep)) throw new ErroChaveInvalida(chave);
    return absoluto;
  }

  async salvar(chave: string, conteudo: Readable): Promise<void> {
    const destino = this.caminhoAbsoluto(chave);
    await mkdir(dirname(destino), { recursive: true });
    // Grava num arquivo parcial e renomeia: quem lê nunca vê um arquivo pela metade.
    const parcial = `${destino}.${randomUUID()}.parcial`;
    try {
      await pipeline(conteudo, createWriteStream(parcial));
      await rename(parcial, destino);
    } catch (erro) {
      await rm(parcial, { force: true });
      throw erro;
    }
  }

  async ler(chave: string): Promise<Readable> {
    const absoluto = this.caminhoAbsoluto(chave);
    const info = await stat(absoluto).catch(() => null);
    if (!info?.isFile()) throw new ErroArquivoNaoEncontrado(chave);
    return createReadStream(absoluto);
  }

  async urlTemporaria(chave: string, segundos: number): Promise<string> {
    validarChave(chave);
    const expiraEm = Math.floor(this.relogio().getTime() / 1000) + segundos;
    const parametros = new URLSearchParams({ c: chave, exp: String(expiraEm), sig: assinarLink(this.segredo, chave, expiraEm) });
    return `/api/arquivos?${parametros.toString()}`;
  }

  async apagar(chave: string): Promise<void> {
    await rm(this.caminhoAbsoluto(chave), { force: true });
  }

  async existe(chave: string): Promise<boolean> {
    const info = await stat(this.caminhoAbsoluto(chave)).catch(() => null);
    return info?.isFile() ?? false;
  }
}
