import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { alocarItensProblema, desfazerAlocacao, motivoParaNaoCancelarDevolucao } from './alocacao';
import { aoAutorizarRemessa, aoCancelarRemessa } from './efeitos-remessa';
import { montarNotaRemessa } from './montar-remessa';

/** Contrato §5.7. A Fase 4 cria a implementação "sem lotes"; a Fase 5 troca o corpo (e só ela). */
export interface PortaLotes {
  /** Na transação da autorização da NF de devolução. */
  alocarItensProblema(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void>;
  /** null = pode cancelar. */
  motivoParaNaoCancelarDevolucao(tx: DbOuTx, devolucaoId: string): Promise<string | null>;
  /** Na transação do cancelamento da NF de devolução. */
  desfazerAlocacao(tx: DbOuTx, devolucaoId: string, agora: Date): Promise<void>;
  /** Spec §8.5. */
  montarNotaRemessa(tx: DbOuTx, loteId: string, referencia: string): Promise<NotaParaEmissao>;
  /** FECHADO → NF_EMITIDA. */
  aoAutorizarRemessa(tx: DbOuTx, loteId: string, notaFiscalId: string, agora: Date): Promise<void>;
  /** NF_EMITIDA → FECHADO. */
  aoCancelarRemessa(tx: DbOuTx, loteId: string, agora: Date): Promise<void>;
}

/**
 * Fase 5: porta inteira ligada (alocação, cancelamento e remessa). Só importa módulos que não importam `fiscal/emissao.ts`
 * (a porta é importada pelo ciclo da Fase 4); os atalhos das telas ficam em `remessa.ts`.
 */
export const portaLotes: PortaLotes = {
  async alocarItensProblema(tx, devolucaoId, agora) {
    await alocarItensProblema(tx, devolucaoId, agora);
  },
  async motivoParaNaoCancelarDevolucao(tx, devolucaoId) {
    return motivoParaNaoCancelarDevolucao(tx, devolucaoId);
  },
  async desfazerAlocacao(tx, devolucaoId, agora) {
    await desfazerAlocacao(tx, devolucaoId, agora);
  },
  async montarNotaRemessa(tx, loteId, referencia) {
    return montarNotaRemessa(tx, loteId, referencia);
  },
  async aoAutorizarRemessa(tx, loteId, notaFiscalId, agora) {
    await aoAutorizarRemessa(tx, loteId, notaFiscalId, agora);
  },
  async aoCancelarRemessa(tx, loteId, agora) {
    await aoCancelarRemessa(tx, loteId, agora);
  },
};
