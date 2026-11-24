import { enviarContestacao } from '@/modules/mercado-livre/contestacoes';
import { processarResultadoConferencia } from '@/modules/mercado-livre/resultado';
import { ehUltimaTentativa, renovarTokensML, sincronizarReclamacao, varrerReclamacoes } from '@/modules/mercado-livre/tarefas';
import { pedirVendasQueFaltam } from '@/modules/mercado-livre/vendas-pendentes';
import type { Manipuladores } from '../tipos';

/** Fase 3 (contrato §5.1). Cada manipulador é idempotente; lançar = nova tentativa. */
export const manipuladoresMercadoLivre: Manipuladores = {
  'ml.sincronizar-reclamacao': async ({ claimId, conta }, ctx) => {
    await sincronizarReclamacao(ctx.db, ctx.fila, claimId, ctx.agora, conta ?? null);
  },
  'ml.varredura': async (_dados, ctx) => {
    await varrerReclamacoes(ctx.db, ctx.fila, ctx.agora);
    // Ficha da venda (extra, E27): as devoluções antigas sem a venda, poucas por rodada; para sozinho quando acabam.
    await pedirVendasQueFaltam(ctx.db, ctx.fila, ctx.agora);
  },
  'ml.renovar-token': async (_dados, ctx) => {
    await renovarTokensML(ctx.db, ctx.agora);
  },
  'ml.enviar-resultado': async ({ devolucaoId }, ctx) => {
    await processarResultadoConferencia(ctx.db, devolucaoId, ctx.agora);
  },
  'ml.enviar-contestacao': async ({ contestacaoId }, ctx) => {
    await enviarContestacao(ctx.db, contestacaoId, { agora: ctx.agora, ultimaTentativa: ehUltimaTentativa('ml.enviar-contestacao', ctx.tentativa) });
  },
};
