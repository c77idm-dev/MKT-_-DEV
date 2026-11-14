import { describe, expect, it } from 'vitest';
import { SITUACOES_NOTA, type SituacaoNotaFiscal } from './dominio';
import { ErroFiscal } from './erros';
import { exigirTransicaoNota, podeTransitarNota } from './transicoes-nota';

// Spec §5.5 e contrato §4.6, escritos de novo de propósito: o teste não lê a tabela do código.
const PERMITIDAS: [SituacaoNotaFiscal | null, SituacaoNotaFiscal][] = [
  [null, 'PROCESSANDO'],
  ['PROCESSANDO', 'AUTORIZADA'],
  ['PROCESSANDO', 'REJEITADA'],
  ['REJEITADA', 'PROCESSANDO'],
  ['AUTORIZADA', 'CANCELADA'],
];

describe('transições da nota fiscal (spec §5.5)', () => {
  it('aceita só as mudanças da tabela', () => {
    for (const de of [null, ...SITUACOES_NOTA]) {
      for (const para of SITUACOES_NOTA) {
        const esperado = PERMITIDAS.some(([d, p]) => d === de && p === para);
        expect(podeTransitarNota({ de, para }), `${de} → ${para}`).toBe(esperado);
      }
    }
  });

  it('recusa com mensagem em português', () => {
    expect(() => exigirTransicaoNota({ de: 'CANCELADA', para: 'AUTORIZADA' })).toThrow(ErroFiscal);
    expect(() => exigirTransicaoNota({ de: 'CANCELADA', para: 'AUTORIZADA' })).toThrow('Mudança não permitida na NF: Cancelada → Autorizada.');
    expect(() => exigirTransicaoNota({ de: null, para: 'AUTORIZADA' })).toThrow('Mudança não permitida na NF: (nova) → Autorizada.');
    expect(() => exigirTransicaoNota({ de: 'REJEITADA', para: 'PROCESSANDO' })).not.toThrow();
  });
});
