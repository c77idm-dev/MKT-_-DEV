export class ErroArquivoNaoEncontrado extends Error {
  constructor(chave: string) {
    super(`Arquivo não encontrado no armazenamento: ${chave}`);
    this.name = 'ErroArquivoNaoEncontrado';
  }
}

export class ErroChaveInvalida extends Error {
  constructor(chave: string) {
    super(`Chave de armazenamento inválida: ${JSON.stringify(chave.slice(0, 80))}`);
    this.name = 'ErroChaveInvalida';
  }
}
