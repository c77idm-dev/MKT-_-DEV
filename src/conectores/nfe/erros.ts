/** O emissor recusou de vez (dado inválido, token recusado, sem permissão): tentar de novo não adianta sem mudar algo. */
export class ErroEmissorRecusou extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroEmissorRecusou';
  }
}

/** Falha passageira (rede, tempo esgotado, 429, 5xx, resposta incompleta): a fila tenta de novo (spec §11). */
export class ErroEmissorIndisponivel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroEmissorIndisponivel';
  }
}
