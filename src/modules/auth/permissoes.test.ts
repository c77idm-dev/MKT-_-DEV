import { describe, expect, it } from 'vitest';
import type { Perfil } from './perfis';
import { abasVisiveis, pode, paginaInicial, type Acao } from './permissoes';

// Spec §6.9, com a mudança da E29 (o Operador só recebe e confere). Linhas: ação; colunas: Operador, Fiscal, Gestor.
const MATRIZ_ESPERADA: [Acao, boolean, boolean, boolean][] = [
  ['ver_listas', true, true, true], // Ver o detalhe da devolução, as retiradas do Full e o dossiê
  ['acompanhar', false, true, true], // (E29) Quadro, busca, etapas, alertas, "Afetam a reputação" e planilha Volta ao armazém
  ['operar_devolucoes', true, false, true], // Receber, conferir
  ['cadastrar_devolucoes', false, false, true], // (E29) Criar ou importar devolução
  ['gerir_fiscal', false, true, true], // Emitir/cancelar NF, gerir lotes
  ['gerir_catalogo', false, true, true], // Importar catálogo, editar produtos e fornecedores
  ['administrar', false, false, true], // Contestações, Configurações, usuários, Falhas, liberar trava
];

describe('pode', () => {
  it.each(MATRIZ_ESPERADA)('%s → Operador %s, Fiscal %s, Gestor %s', (acao, operador, fiscal, gestor) => {
    expect(pode('OPERADOR', acao)).toBe(operador);
    expect(pode('FISCAL', acao)).toBe(fiscal);
    expect(pode('GESTOR', acao)).toBe(gestor);
  });
});

describe('abasVisiveis', () => {
  const rotulos = (perfil: Perfil) => abasVisiveis(perfil).map((a) => a.rotulo);

  it('Operador vê só a Bancada (E29)', () => {
    expect(abasVisiveis('OPERADOR').map((a) => [a.rotulo, a.href])).toEqual([['Bancada', '/bancada']]);
  });

  it('Fiscal vê Fluxo, Lotes e Cadastros (sem a Bancada)', () => {
    expect(rotulos('FISCAL')).toEqual(['Fluxo', 'Lotes e Remessas', 'Produtos e Fornecedores']);
  });

  it('Gestor vê todas as abas, na ordem do menu, sem a Bancada (ele chega a ela pelo menu do Fluxo)', () => {
    expect(rotulos('GESTOR')).toEqual([
      'Fluxo',
      'Contestações ML',
      'Lotes e Remessas',
      'Produtos e Fornecedores',
      'Configurações',
    ]);
  });
});

describe('paginaInicial (E29)', () => {
  it('o Operador começa na Bancada; o Fiscal e o Gestor, no Fluxo', () => {
    expect(paginaInicial('OPERADOR')).toBe('/bancada');
    expect(paginaInicial('FISCAL')).toBe('/fluxo');
    expect(paginaInicial('GESTOR')).toBe('/fluxo');
  });
});
