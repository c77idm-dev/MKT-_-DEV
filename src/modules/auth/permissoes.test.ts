import { describe, expect, it } from 'vitest';
import type { Perfil } from './perfis';
import { abasVisiveis, pode, type Acao } from './permissoes';

// Spec §6.9. Linhas: ação; colunas: Operador, Fiscal, Gestor.
const MATRIZ_ESPERADA: [Acao, boolean, boolean, boolean][] = [
  ['ver_listas', true, true, true], // Ver listas e busca
  ['operar_devolucoes', true, false, true], // Criar/importar devolução, receber, conferir
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

  it('Operador vê só o Fluxo', () => {
    expect(rotulos('OPERADOR')).toEqual(['Fluxo']);
  });

  it('Fiscal vê Fluxo, Lotes e Cadastros', () => {
    expect(rotulos('FISCAL')).toEqual(['Fluxo', 'Lotes e Remessas', 'Produtos e Fornecedores']);
  });

  it('Gestor vê todas as abas, na ordem do menu', () => {
    expect(rotulos('GESTOR')).toEqual([
      'Fluxo',
      'Contestações ML',
      'Lotes e Remessas',
      'Produtos e Fornecedores',
      'Configurações',
    ]);
  });
});
