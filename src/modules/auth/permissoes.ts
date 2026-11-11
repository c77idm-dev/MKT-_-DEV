import type { Perfil } from './perfis';

export type Acao = 'ver_listas' | 'operar_devolucoes' | 'gerir_fiscal' | 'gerir_catalogo' | 'administrar';

/** Spec §6.9. */
const MATRIZ: Record<Acao, readonly Perfil[]> = {
  ver_listas: ['OPERADOR', 'FISCAL', 'GESTOR'],
  operar_devolucoes: ['OPERADOR', 'GESTOR'],
  gerir_fiscal: ['FISCAL', 'GESTOR'],
  gerir_catalogo: ['FISCAL', 'GESTOR'],
  administrar: ['GESTOR'],
};

export function pode(perfil: Perfil, acao: Acao): boolean {
  return MATRIZ[acao].includes(perfil);
}

export type Aba = { rotulo: string; href: string; acao: Acao };

/** Abas da barra superior (direção visual C, spec §6.0), na ordem do menu. */
export const ABAS: readonly Aba[] = [
  { rotulo: 'Fluxo', href: '/fluxo', acao: 'ver_listas' },
  { rotulo: 'Contestações ML', href: '/contestacoes', acao: 'administrar' },
  { rotulo: 'Lotes e Remessas', href: '/lotes', acao: 'gerir_fiscal' },
  { rotulo: 'Produtos e Fornecedores', href: '/cadastros', acao: 'gerir_catalogo' },
  { rotulo: 'Configurações', href: '/configuracoes', acao: 'administrar' },
];

export function abasVisiveis(perfil: Perfil): Aba[] {
  return ABAS.filter((aba) => pode(perfil, aba.acao));
}
