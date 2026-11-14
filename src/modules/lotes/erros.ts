import { ErroFiscal } from '../fiscal/erros';

/** Erro de regra dos lotes, com mensagem pronta para a tela (decisão 21). */
export class ErroLotes extends ErroFiscal {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroLotes';
  }
}
