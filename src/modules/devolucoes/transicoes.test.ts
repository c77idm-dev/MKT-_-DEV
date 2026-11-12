import { describe, expect, it } from 'vitest';
import { STATUS_DEVOLUCAO, type StatusDevolucao } from './dominio';
import { ErroTransicao, exigirTransicao, podeTransitar, type Ator } from './transicoes';

const ATORES: Ator[] = ['SISTEMA', 'OPERADOR', 'FISCAL', 'GESTOR'];

// Spec §5.2, escrita aqui de novo de propósito: o teste não lê a tabela do código.
// Onde a spec diz "Operador", o Gestor também pode (spec §6.9).
const PERMITIDAS: [StatusDevolucao | null, StatusDevolucao, Ator[], boolean][] = [
  [null, 'PENDENTE_CHEGADA', ['SISTEMA', 'OPERADOR', 'GESTOR'], false],
  ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  [null, 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], true],
  ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  ['EM_CONFERENCIA', 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  ['EM_CONFERENCIA', 'AGUARDANDO_NF', ['OPERADOR', 'GESTOR'], false],
  ['AGUARDANDO_NF', 'CONCLUIDA', ['SISTEMA'], false],
  ['CONCLUIDA', 'AGUARDANDO_NF', ['SISTEMA'], false],
  ['PENDENTE_CHEGADA', 'CANCELADA', ['SISTEMA', 'GESTOR'], false],
  ['PENDENTE_CHEGADA', 'EXTRAVIADA', ['SISTEMA', 'GESTOR'], false],
  ['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE', ['SISTEMA'], false],
  ['NO_CD_MARKETPLACE', 'PENDENTE_CHEGADA', ['SISTEMA'], false],
];

function esperado(de: StatusDevolucao | null, para: StatusDevolucao, ator: Ator, naoIdentificada: boolean): boolean {
  return PERMITIDAS.some(([d, p, atores, so]) => d === de && p === para && atores.includes(ator) && (!so || naoIdentificada));
}

describe('podeTransitar (spec §5.2)', () => {
  it.each(PERMITIDAS)('%s → %s é permitida para %j', (de, para, atores, soNaoIdentificada) => {
    for (const ator of atores) {
      expect(podeTransitar({ de, para, ator, naoIdentificada: soNaoIdentificada })).toBe(true);
    }
  });

  it('recusa toda combinação fora da tabela (de, para, quem e "não identificada")', () => {
    for (const de of [null, ...STATUS_DEVOLUCAO]) {
      for (const para of STATUS_DEVOLUCAO) {
        for (const ator of ATORES) {
          for (const naoIdentificada of [false, true]) {
            expect(podeTransitar({ de, para, ator, naoIdentificada }), `${de} → ${para} por ${ator} (não identificada: ${naoIdentificada})`).toBe(
              esperado(de, para, ator, naoIdentificada),
            );
          }
        }
      }
    }
  });

  it('a devolução nova só nasce em "Aguardando conferência" quando é não identificada', () => {
    expect(podeTransitar({ de: null, para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR' })).toBe(false);
    expect(podeTransitar({ de: null, para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR', naoIdentificada: true })).toBe(true);
  });

  it('o Fiscal não recebe, não cria e não cancela', () => {
    expect(podeTransitar({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', ator: 'FISCAL' })).toBe(false);
    expect(podeTransitar({ de: null, para: 'PENDENTE_CHEGADA', ator: 'FISCAL' })).toBe(false);
    expect(podeTransitar({ de: 'PENDENTE_CHEGADA', para: 'CANCELADA', ator: 'FISCAL' })).toBe(false);
  });
});

describe('exigirTransicao', () => {
  it('lança ErroTransicao com a mensagem em português', () => {
    const pedido = { de: 'CANCELADA', para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR' } as const;
    expect(() => exigirTransicao(pedido)).toThrow(ErroTransicao);
    expect(() => exigirTransicao(pedido)).toThrow('Mudança de status não permitida: Cancelada → Aguardando conferência (Operador).');
  });

  it('não lança quando a mudança é permitida', () => {
    expect(() => exigirTransicao({ de: 'PENDENTE_CHEGADA', para: 'CANCELADA', ator: 'GESTOR' })).not.toThrow();
  });
});
