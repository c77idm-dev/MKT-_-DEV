/** Resposta das ações da Seção Fiscal. A mensagem fica no bloco (que não some), com o foco no erro ou no sucesso. */
export type EstadoAcaoFiscal = { erros: string[]; ok: string | null };
export const ESTADO_INICIAL_FISCAL: EstadoAcaoFiscal = { erros: [], ok: null };
