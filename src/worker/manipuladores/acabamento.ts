import { aplicarRetencao, limparLinhasImportacoes } from '@/modules/acabamento/retencao';
import type { Manipuladores } from '../tipos';

/** Fase 6: midia.retencao. Só a Fase 6 edita este arquivo. */
export const manipuladoresAcabamento: Manipuladores = {
  'midia.retencao': async (_dados, ctx) => {
    const r = await aplicarRetencao(ctx.db, { agora: ctx.agora });
    const importacoes = await limparLinhasImportacoes(ctx.db, ctx.agora);
    console.log(JSON.stringify({ origem: 'worker', tarefa: 'midia.retencao', ...r, importacoes }));
  },
};
