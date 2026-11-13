import { describe, expect, it } from 'vitest';
import { STATUS_ITEM, type StatusItem } from './dominio';
import { ErroTransicaoItem, exigirTransicaoItem, podeTransitarItem } from './transicoes-item';
import type { Ator } from './transicoes';

const ATORES: Ator[] = ['SISTEMA', 'OPERADOR', 'FISCAL', 'GESTOR'];

// Contrato §4.6, escrito aqui de novo de propósito: o teste não lê a tabela do código.
const PERMITIDAS: [StatusItem, StatusItem, Ator[]][] = [
  ['PENDENTE', 'AGUARDANDO_NF', ['OPERADOR', 'GESTOR']],
  ['PENDENTE', 'AUSENTE', ['OPERADOR', 'GESTOR']],
  ['AGUARDANDO_NF', 'DISPONIVEL_VENDA', ['SISTEMA']],
  ['DISPONIVEL_VENDA', 'AGUARDANDO_NF', ['SISTEMA']],
  ['AGUARDANDO_NF', 'EM_LOTE', ['SISTEMA']],
  ['AGUARDANDO_NF', 'SEM_FORNECEDOR', ['SISTEMA']],
  ['SEM_FORNECEDOR', 'EM_LOTE', ['FISCAL', 'GESTOR', 'SISTEMA']],
  ['EM_LOTE', 'AGUARDANDO_NF', ['SISTEMA']],
  ['SEM_FORNECEDOR', 'AGUARDANDO_NF', ['SISTEMA']],
  ['EM_LOTE', 'ENVIADO', ['FISCAL', 'GESTOR']],
  ['ENVIADO', 'RESOLVIDO', ['FISCAL', 'GESTOR']],
];

describe('podeTransitarItem (contrato §4.6)', () => {
  it('aceita exatamente as linhas da tabela e recusa todo o resto', () => {
    for (const de of STATUS_ITEM) {
      for (const para of STATUS_ITEM) {
        for (const ator of ATORES) {
          const esperado = PERMITIDAS.some(([d, p, atores]) => d === de && p === para && atores.includes(ator));
          expect(podeTransitarItem({ de, para, ator }), `${de} → ${para} por ${ator}`).toBe(esperado);
        }
      }
    }
  });

  it('o Fiscal não conclui a conferência', () => {
    expect(podeTransitarItem({ de: 'PENDENTE', para: 'AGUARDANDO_NF', ator: 'FISCAL' })).toBe(false);
  });
});

describe('exigirTransicaoItem', () => {
  it('lança ErroTransicaoItem com a mensagem em português', () => {
    const pedido = { de: 'RESOLVIDO', para: 'PENDENTE', ator: 'GESTOR' } as const;
    expect(() => exigirTransicaoItem(pedido)).toThrow(ErroTransicaoItem);
    expect(() => exigirTransicaoItem(pedido)).toThrow('Mudança de status do item não permitida: Resolvido → Pendente (Gestor).');
  });
});
