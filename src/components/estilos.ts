/** Classes repetidas nas telas (direção C, spec §6.0). Toque mínimo de 44 px (min-h-11). */
export const CAMPO = 'h-11 w-full rounded-lg border border-borda-campo bg-superficie px-3 text-[15px]';
export const ROTULO = 'text-[13px] font-semibold text-texto-2';
export const BOTAO_PRIMARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-destaque px-5 text-[15px] font-semibold text-white hover:bg-destaque-escuro disabled:opacity-60';
export const BOTAO_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-borda-campo bg-superficie px-5 text-[15px] font-semibold text-texto hover:bg-fundo disabled:opacity-60';
export const LINK_VOLTAR = 'inline-flex min-h-11 items-center text-sm font-semibold text-destaque';
export const BOTAO_PERIGO =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full border border-erro bg-superficie px-5 text-[15px] font-semibold text-erro hover:bg-erro-suave disabled:opacity-60';
export const CARTAO = 'rounded-xl border border-borda bg-superficie p-4';
/** Cartão de uma lista: o cartão inteiro é o link (alvo de toque grande). */
export const ITEM_LISTA = 'flex min-h-11 flex-col gap-1 rounded-xl border border-borda bg-superficie p-3 hover:border-destaque';
export const VAZIO = 'rounded-lg border border-dashed border-borda-forte px-3 py-6 text-center text-sm text-texto-2';
export const ALERTA_ERRO = 'rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro';
export const ALERTA_OK = 'rounded-lg bg-bom-suave px-3 py-2 text-sm font-medium text-bom';
export const ALERTA_ATENCAO = 'rounded-lg bg-atencao-suave px-3 py-2 text-sm font-medium text-atencao';
