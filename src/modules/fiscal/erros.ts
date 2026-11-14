/** Erro de regra fiscal, com mensagem pronta para mostrar na tela. */
export class ErroFiscal extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroFiscal';
  }
}

export class ErroNotaVendaDuplicada extends ErroFiscal {
  constructor() {
    super('Esta NF de venda já está anexada a esta devolução.');
    this.name = 'ErroNotaVendaDuplicada';
  }
}
