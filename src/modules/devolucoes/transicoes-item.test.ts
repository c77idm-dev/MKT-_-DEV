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
  // (extra, E29) Corrigir (Gestor): reabrir a conferência e desfazer a chegada devolvem a unidade à conferência.
  ['AGUARDANDO_NF', 'PENDENTE', ['GESTOR']],
  ['AUSENTE', 'PENDENTE', ['GESTOR']],
  // (extra, E29) Trocar o estoque depois da NF: Bom → Problema entra no lote (ou fica sem fornecedor); Problema → Bom sai.
  ['DISPONIVEL_VENDA', 'EM_LOTE', ['GESTOR']],
  ['DISPONIVEL_VENDA', 'SEM_FORNECEDOR', ['GESTOR']],
  ['EM_LOTE', 'DISPONIVEL_VENDA', ['GESTOR']],
  ['SEM_FORNECEDOR', 'DISPONIVEL_VENDA', ['GESTOR']],
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

  it('(extra, E29) só o Gestor devolve a unidade à conferência e troca o estoque depois da NF', () => {
    for (const ator of ['SISTEMA', 'OPERADOR', 'FISCAL'] as const) {
      expect(podeTransitarItem({ de: 'AGUARDANDO_NF', para: 'PENDENTE', ator })).toBe(false);
      expect(podeTransitarItem({ de: 'DISPONIVEL_VENDA', para: 'EM_LOTE', ator })).toBe(false);
      expect(podeTransitarItem({ de: 'EM_LOTE', para: 'DISPONIVEL_VENDA', ator })).toBe(false);
    }
    // O que já saiu do sistema não volta.
    expect(podeTransitarItem({ de: 'ENVIADO', para: 'DISPONIVEL_VENDA', ator: 'GESTOR' })).toBe(false);
    expect(podeTransitarItem({ de: 'RESOLVIDO', para: 'DISPONIVEL_VENDA', ator: 'GESTOR' })).toBe(false);
  });
});

describe('exigirTransicaoItem', () => {
  it('lança ErroTransicaoItem com a mensagem em português', () => {
    const pedido = { de: 'RESOLVIDO', para: 'PENDENTE', ator: 'GESTOR' } as const;
    expect(() => exigirTransicaoItem(pedido)).toThrow(ErroTransicaoItem);
    expect(() => exigirTransicaoItem(pedido)).toThrow('Mudança de status do item não permitida: Resolvido → Pendente (Gestor).');
  });
});
