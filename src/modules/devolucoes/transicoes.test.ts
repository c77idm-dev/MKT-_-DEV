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
  // (extra, emenda E25) O pacote que o ML mandou de volta do armazém chega na recepção.
  ['NO_CD_MARKETPLACE', 'AGUARDANDO_CONFERENCIA', ['OPERADOR', 'GESTOR'], false],
  // (extra, emenda E29) Corrigir (Gestor): reabrir a conferência, desfazer a chegada e cancelar ou extraviar antes da NF.
  ['AGUARDANDO_NF', 'AGUARDANDO_CONFERENCIA', ['GESTOR'], false],
  ...(['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF'] as const).flatMap((de) =>
    (['PENDENTE_CHEGADA', 'NO_CD_MARKETPLACE', 'CANCELADA', 'EXTRAVIADA'] as const).map(
      (para): [StatusDevolucao, StatusDevolucao, Ator[], boolean] => [de, para, ['GESTOR'], false],
    ),
  ),
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

  it('(extra, E25) o pacote que voltou do armazém do ML é recebido por quem opera o Recebimento; o Fiscal e o sistema não', () => {
    expect(podeTransitar({ de: 'NO_CD_MARKETPLACE', para: 'AGUARDANDO_CONFERENCIA', ator: 'OPERADOR' })).toBe(true);
    expect(podeTransitar({ de: 'NO_CD_MARKETPLACE', para: 'AGUARDANDO_CONFERENCIA', ator: 'GESTOR' })).toBe(true);
    expect(podeTransitar({ de: 'NO_CD_MARKETPLACE', para: 'AGUARDANDO_CONFERENCIA', ator: 'FISCAL' })).toBe(false);
    expect(podeTransitar({ de: 'NO_CD_MARKETPLACE', para: 'AGUARDANDO_CONFERENCIA', ator: 'SISTEMA' })).toBe(false);
    // Cancelada e Extraviada continuam sem caminho para a recepção.
    expect(podeTransitar({ de: 'CANCELADA', para: 'AGUARDANDO_CONFERENCIA', ator: 'GESTOR' })).toBe(false);
    expect(podeTransitar({ de: 'EXTRAVIADA', para: 'AGUARDANDO_CONFERENCIA', ator: 'GESTOR' })).toBe(false);
  });

  it('(extra, E29) só o Gestor reabre a conferência, desfaz a chegada e cancela antes da NF; depois da NF, ninguém', () => {
    for (const ator of ['SISTEMA', 'OPERADOR', 'FISCAL'] as const) {
      expect(podeTransitar({ de: 'AGUARDANDO_NF', para: 'AGUARDANDO_CONFERENCIA', ator })).toBe(false);
      expect(podeTransitar({ de: 'EM_CONFERENCIA', para: 'PENDENTE_CHEGADA', ator })).toBe(false);
      expect(podeTransitar({ de: 'AGUARDANDO_NF', para: 'CANCELADA', ator })).toBe(false);
    }
    expect(podeTransitar({ de: 'AGUARDANDO_CONFERENCIA', para: 'NO_CD_MARKETPLACE', ator: 'GESTOR' })).toBe(true);
    expect(podeTransitar({ de: 'CONCLUIDA', para: 'CANCELADA', ator: 'GESTOR' })).toBe(false);
    expect(podeTransitar({ de: 'CONCLUIDA', para: 'AGUARDANDO_CONFERENCIA', ator: 'GESTOR' })).toBe(false);
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
