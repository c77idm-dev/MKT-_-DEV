import { alocarPendentes } from '@/modules/lotes/pendentes';
import type { Manipuladores } from '../tipos';

/** Contrato §5.1: uma vez, na subida do worker (TAREFAS_NA_SUBIDA). Idempotente. */
export const manipuladoresLotes: Manipuladores = {
  'lotes.alocar-pendentes': async (_dados, ctx) => {
    await alocarPendentes(ctx.db, ctx.agora);
  },
};
