import { describe, expect, it } from 'vitest';
import {
  ehCodigoLote,
  ehResultadoFornecedor,
  ehStatusLote,
  ehTipoLote,
  ROTULO_RESULTADO,
  ROTULO_STATUS_LOTE,
  ROTULO_TIPO_LOTE,
  tipoNotaDoLote,
} from './dominio';

describe('vocabulário dos lotes (spec §5.1, §5.3, §5.4)', () => {
  it('tipos e status com os nomes da spec', () => {
    expect(Object.values(ROTULO_TIPO_LOTE)).toEqual(['Conserto', 'Troca', 'Garantia']);
    expect(Object.values(ROTULO_STATUS_LOTE)).toEqual(['Aberto', 'Fechado', 'NF emitida', 'Enviado', 'Finalizado']);
    expect(Object.values(ROTULO_RESULTADO)).toEqual(['Trocado', 'Consertado', 'Crédito', 'Descartado', 'Devolvido sem solução']);
  });

  it('tipo do lote → tipo da NF (contrato §4.4)', () => {
    expect(tipoNotaDoLote('CONSERTO')).toBe('REMESSA_CONSERTO');
    expect(tipoNotaDoLote('TROCA')).toBe('REMESSA_TROCA_GARANTIA');
    expect(tipoNotaDoLote('GARANTIA')).toBe('REMESSA_TROCA_GARANTIA');
  });

  it('reconhece os valores e o código LOT', () => {
    expect(ehTipoLote('TROCA')).toBe(true);
    expect(ehTipoLote('troca')).toBe(false);
    expect(ehStatusLote('NF_EMITIDA')).toBe(true);
    expect(ehStatusLote('CANCELADO')).toBe(false);
    expect(ehResultadoFornecedor('CREDITO')).toBe(true);
    expect(ehResultadoFornecedor('PERDIDO')).toBe(false);
    expect(ehCodigoLote('LOT-000045')).toBe(true);
    expect(ehCodigoLote('LOT-1234567')).toBe(true);
    expect(ehCodigoLote('LOT-45')).toBe(false);
    expect(ehCodigoLote('DEV-000045')).toBe(false);
  });
});
