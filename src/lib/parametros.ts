export type ParametrosBusca = Record<string, string | string[] | undefined>;

export function primeiroValor(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? '';
}

export function lerPagina(parametros: ParametrosBusca): number {
  const n = Number(primeiroValor(parametros.pagina));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
