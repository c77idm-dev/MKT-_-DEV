export type ContaVista = {
  empresa: string;
  nome: string;
  sellerId: string;
  recebeDevolucoes: boolean;
  disponivel: boolean;
  /** Já formatada no servidor (horário de Brasília); null = ainda não sincronizou. */
  ultimaSincronizacao: string | null;
  atrasada: boolean;
};
export type EstadoContasBitbrain = { erros: string[]; ok: string | null };
export const ESTADO_INICIAL_CONTAS: EstadoContasBitbrain = { erros: [], ok: null };
