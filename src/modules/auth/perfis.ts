export const PERFIS = ['OPERADOR', 'FISCAL', 'GESTOR'] as const;
export type Perfil = (typeof PERFIS)[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  OPERADOR: 'Operador',
  FISCAL: 'Fiscal',
  GESTOR: 'Gestor',
};

export function ehPerfil(texto: string): texto is Perfil {
  return (PERFIS as readonly string[]).includes(texto);
}
