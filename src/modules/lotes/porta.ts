import type { NotaParaEmissao } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { ErroFiscal } from '@/modules/fiscal/erros';

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

const REMESSAS_NA_FASE_5 = 'As remessas chegam na Fase 5';

/** "Sem lotes" (D11): o item PROBLEMA fica em AGUARDANDO_NF depois da NF; a Fase 5 aloca os pendentes. */
export const portaLotes: PortaLotes = {
  async alocarItensProblema() {
    // D11: nada a fazer até a Fase 5.
  },
  async motivoParaNaoCancelarDevolucao() {
    return null;
  },
  async desfazerAlocacao() {
    // D11: nada foi alocado, nada a desfazer.
  },
  async montarNotaRemessa() {
    throw new ErroFiscal(REMESSAS_NA_FASE_5);
  },
  async aoAutorizarRemessa() {
    throw new ErroFiscal(REMESSAS_NA_FASE_5);
  },
  async aoCancelarRemessa() {
    throw new ErroFiscal(REMESSAS_NA_FASE_5);
  },
};
