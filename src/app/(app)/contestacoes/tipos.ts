import type { DadosSelo } from '@/modules/devolucoes/selos';

export type OkVista = { devolucaoId: string; codigo: string; pedidos: string; reclamacaoId: string; conta: string | null; selo: DadosSelo | null };
export type EstadoOk = { erros: string[]; ok: string | null };
export const ESTADO_INICIAL_OK: EstadoOk = { erros: [], ok: null };
