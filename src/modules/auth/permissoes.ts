import type { Perfil } from './perfis';

export type Acao =
  | 'ver_listas'
  | 'acompanhar'
  | 'operar_devolucoes'
  | 'cadastrar_devolucoes'
  | 'gerir_fiscal'
  | 'gerir_catalogo'
  | 'administrar';

/**
 * Spec §6.9, com a mudança da E29 (extra, 27/11): o Operador só recebe e confere, na Bancada.
 * - `acompanhar`: o quadro, a busca, as etapas, os alertas, o "Afetam a reputação" e a planilha Volta ao armazém;
 * - `cadastrar_devolucoes`: criar e importar devolução (antes dentro de `operar_devolucoes`);
 * - `ver_listas`: o que o Operador continua abrindo (o detalhe da devolução, só leitura, as Retiradas do Full e o dossiê).
 */
const MATRIZ: Record<Acao, readonly Perfil[]> = {
  ver_listas: ['OPERADOR', 'FISCAL', 'GESTOR'],
  acompanhar: ['FISCAL', 'GESTOR'],
  operar_devolucoes: ['OPERADOR', 'GESTOR'],
  cadastrar_devolucoes: ['GESTOR'],
  gerir_fiscal: ['FISCAL', 'GESTOR'],
  gerir_catalogo: ['FISCAL', 'GESTOR'],
  administrar: ['GESTOR'],
};

export function pode(perfil: Perfil, acao: Acao): boolean {
  return MATRIZ[acao].includes(perfil);
}

/** `exceto` (E29): a aba some para quem pode esta ação (a Bancada é do Operador; o Gestor chega a ela pelo menu do Fluxo). */
export type Aba = { rotulo: string; href: string; acao: Acao; exceto?: Acao };

/** Abas da barra superior (direção visual C, spec §6.0), na ordem do menu. */
export const ABAS: readonly Aba[] = [
  { rotulo: 'Bancada', href: '/bancada', acao: 'operar_devolucoes', exceto: 'acompanhar' },
  { rotulo: 'Fluxo', href: '/fluxo', acao: 'acompanhar' },
  { rotulo: 'Contestações ML', href: '/contestacoes', acao: 'administrar' },
  { rotulo: 'Lotes e Remessas', href: '/lotes', acao: 'gerir_fiscal' },
  { rotulo: 'Produtos e Fornecedores', href: '/cadastros', acao: 'gerir_catalogo' },
  { rotulo: 'Configurações', href: '/configuracoes', acao: 'administrar' },
];

export function abasVisiveis(perfil: Perfil): Aba[] {
  return ABAS.filter((aba) => pode(perfil, aba.acao) && !(aba.exceto && pode(perfil, aba.exceto)));
}

/** (E29) Para onde vão o login, o `/login` com sessão e o `/`: o Operador começa na Bancada; quem acompanha, no Fluxo. */
export function paginaInicial(perfil: Perfil): '/bancada' | '/fluxo' {
  return pode(perfil, 'acompanhar') ? '/fluxo' : '/bancada';
}
