/** Resposta das Server Actions da bancada: os erros já vêm em português, prontos para a tela. */
export type RespostaAcao<T = object> = ({ ok: true } & T) | { ok: false; erros: string[] };
