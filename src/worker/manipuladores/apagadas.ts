import { expurgarApagadas } from '@/modules/apagadas/expurgo';
import type { Manipuladores } from '../tipos';

/** (extra, emenda E29) apagadas.expurgo: uma vez por dia, como a midia.retencao (Fase 6). */
export const manipuladoresApagadas: Manipuladores = {
  'apagadas.expurgo': async (_dados, ctx) => {
    const r = await expurgarApagadas(ctx.db, ctx.agora);
    console.log(JSON.stringify({ origem: 'worker', tarefa: 'apagadas.expurgo', ...r }));
  },
};
