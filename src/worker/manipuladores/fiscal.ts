import { processarConsulta, processarEmissao } from '@/modules/fiscal/ciclo';
import type { Manipuladores } from '../tipos';

/** Contrato §5.1: envio e consulta da NF-e. Idempotentes; erro passageiro lança (a fila tenta de novo, spec §11). */
export const manipuladoresFiscal: Manipuladores = {
  'nfe.emitir': async ({ notaFiscalId }, ctx) => processarEmissao(ctx.db, ctx.fila, notaFiscalId, ctx.agora),
  'nfe.consultar': async ({ notaFiscalId, consulta }, ctx) => processarConsulta(ctx.db, ctx.fila, notaFiscalId, consulta, ctx.agora),
};
