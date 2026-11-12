/** Erro de regra do cadastro, com mensagem pronta para mostrar na tela. */
export class ErroCadastro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCadastro';
  }
}
