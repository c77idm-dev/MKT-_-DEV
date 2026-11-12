export type ParametrosBusca = Record<string, string | string[] | undefined>;

export function primeiroValor(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? '';
}

export const PAGINA_MAXIMA = 10_000;

/** Página de 1 a 10000 (acima disso o OFFSET passaria do bigint e a consulta daria erro 500). */
export function lerPagina(parametros: ParametrosBusca): number {
  const n = Number(primeiroValor(parametros.pagina));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, PAGINA_MAXIMA) : 1;
}
