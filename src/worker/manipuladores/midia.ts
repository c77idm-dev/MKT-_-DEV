import { limparTemporarios } from '@/modules/midia/limpeza';
import { processarFoto, transcodificarVideo } from '@/modules/midia/processamento';
import type { Manipuladores } from '../tipos';

/** Fase 2: midia.processar-foto, midia.transcodificar e limpeza.temporarios. Só a Fase 2 edita este arquivo. */
export const manipuladoresMidia: Manipuladores = {
  'midia.processar-foto': (dados, ctx) => processarFoto(ctx.db, dados.evidenciaId, ctx),
  'midia.transcodificar': (dados, ctx) => transcodificarVideo(ctx.db, dados.evidenciaId, ctx),
  'limpeza.temporarios': async (_dados, ctx) => {
    const r = await limparTemporarios(ctx.db, { agora: ctx.agora });
    console.log(JSON.stringify({ origem: 'worker', tarefa: 'limpeza.temporarios', ...r }));
  },
};
