import { processarFoto } from '@/modules/midia/processamento';
import type { Manipuladores } from '../tipos';

/** Fase 2: midia.processar-foto, midia.transcodificar e limpeza.temporarios. Só a Fase 2 edita este arquivo. */
export const manipuladoresMidia: Manipuladores = {
  'midia.processar-foto': (dados, ctx) => processarFoto(ctx.db, dados.evidenciaId, ctx),
};
