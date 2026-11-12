/** Erro de regra das devoluções, com mensagem pronta para mostrar na tela. */
export class ErroDevolucao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDevolucao';
  }
}

export class ErroDevolucaoDuplicada extends ErroDevolucao {
  readonly codigo: string;

  constructor(codigo: string) {
    super(`Já existe a devolução ${codigo} para este pedido neste canal.`);
    this.name = 'ErroDevolucaoDuplicada';
    this.codigo = codigo;
  }
}
