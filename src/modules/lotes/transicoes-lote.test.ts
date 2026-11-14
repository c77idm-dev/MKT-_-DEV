import { describe, expect, it } from 'vitest';
import type { Ator } from '@/modules/devolucoes/transicoes';
import { STATUS_LOTE, type StatusLote } from './dominio';
import { ErroLotes } from './erros';
import { exigirTransicaoLote, podeTransitarLote } from './transicoes-lote';

// Spec §5.4, contrato §4.6 e decisão 2, escritos de novo de propósito: o teste não lê a tabela do código.
const FISCAL_GESTOR: Ator[] = ['FISCAL', 'GESTOR'];
const PERMITIDAS: [StatusLote | null, StatusLote, Ator[]][] = [
  [null, 'ABERTO', ['SISTEMA']],
  [null, 'FECHADO', FISCAL_GESTOR],
  ['ABERTO', 'FECHADO', FISCAL_GESTOR],
  ['FECHADO', 'ABERTO', FISCAL_GESTOR],
  ['FECHADO', 'NF_EMITIDA', ['SISTEMA']],
  ['NF_EMITIDA', 'FECHADO', ['SISTEMA']],
  ['NF_EMITIDA', 'ENVIADO', FISCAL_GESTOR],
  ['ENVIADO', 'FINALIZADO', ['SISTEMA']],
];
const ATORES: Ator[] = ['OPERADOR', 'FISCAL', 'GESTOR', 'SISTEMA'];

describe('transições do lote (spec §5.4)', () => {
  it('aceita só as mudanças da tabela, com os atores certos', () => {
    for (const de of [null, ...STATUS_LOTE]) {
      for (const para of STATUS_LOTE) {
        for (const ator of ATORES) {
          const esperado = PERMITIDAS.some(([d, p, a]) => d === de && p === para && a.includes(ator));
          expect(podeTransitarLote({ de, para, ator }), `${de} → ${para} (${ator})`).toBe(esperado);
        }
      }
    }
  });

  it('recusa no servidor com mensagem em português', () => {
    expect(() => exigirTransicaoLote({ de: 'FECHADO', para: 'ENVIADO', ator: 'FISCAL' })).toThrow(ErroLotes);
    expect(() => exigirTransicaoLote({ de: 'FECHADO', para: 'ENVIADO', ator: 'FISCAL' })).toThrow(
      'Mudança não permitida no lote: Fechado → Enviado (Fiscal).',
    );
    expect(() => exigirTransicaoLote({ de: null, para: 'FECHADO', ator: 'OPERADOR' })).toThrow(
      'Mudança não permitida no lote: (novo) → Fechado (Operador).',
    );
    expect(() => exigirTransicaoLote({ de: 'ENVIADO', para: 'FINALIZADO', ator: 'SISTEMA' })).not.toThrow();
  });
});
