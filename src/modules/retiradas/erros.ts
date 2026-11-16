/** Erro de regra da retirada do Full, com mensagem pronta para mostrar na tela. */
export class ErroRetirada extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroRetirada';
  }
}
