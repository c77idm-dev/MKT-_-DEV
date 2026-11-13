import { Readable } from 'node:stream';
import type { ArmazenamentoArquivos } from './armazenamento';
import { validarChave } from './chaves';
import { ErroArquivoNaoEncontrado } from './erros';

/** Para os testes de integração (instalado pelo tests/setup/int-setup.ts). */
export class ArmazenamentoMemoria implements ArmazenamentoArquivos {
  readonly provedor = 'memoria';
  readonly arquivos = new Map<string, { conteudo: Buffer; tipoConteudo?: string }>();

  async salvar(chave: string, conteudo: Readable, opcoes: { tipoConteudo?: string } = {}): Promise<void> {
    validarChave(chave);
    const partes: Buffer[] = [];
    for await (const parte of conteudo) partes.push(Buffer.from(parte));
    this.arquivos.set(chave, { conteudo: Buffer.concat(partes), tipoConteudo: opcoes.tipoConteudo });
  }

  async ler(chave: string): Promise<Readable> {
    const arquivo = this.arquivos.get(chave);
    if (!arquivo) throw new ErroArquivoNaoEncontrado(chave);
    return Readable.from([arquivo.conteudo]);
  }

  async urlTemporaria(chave: string, segundos: number): Promise<string> {
    validarChave(chave);
    return `memoria://${chave}?expira=${segundos}`;
  }

  async apagar(chave: string): Promise<void> {
    this.arquivos.delete(chave);
  }

  async existe(chave: string): Promise<boolean> {
    return this.arquivos.has(chave);
  }
}
