export const PERFIS = ['OPERADOR', 'FISCAL', 'GESTOR'] as const;
export type Perfil = (typeof PERFIS)[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  GESTOR: 'Gestor',
};
