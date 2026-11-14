import { ErroDevolucao } from '@/modules/devolucoes/erros';

/** Erro de regra da conferência, com mensagem pronta para a tela (as ações já tratam ErroDevolucao). */
export class ErroConferencia extends ErroDevolucao {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConferencia';
  }
}

/** Spec §6.3: "a conferência não termina enquanto faltar evidência obrigatória ou algum arquivo não tiver subido". */
export class ErroConclusao extends ErroConferencia {
  readonly pendencias: string[];

  constructor(pendencias: string[]) {
    super(`Ainda falta: ${pendencias.join('; ')}.`);
    this.name = 'ErroConclusao';
    this.pendencias = pendencias;
  }
}
