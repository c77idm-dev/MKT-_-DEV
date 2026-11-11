const UTC_MENOS_3_MS = 3 * 60 * 60 * 1000;

/**
 * Formato pedido pelo filtro `range=last_updated:after:` do ML: horário de Brasília com milissegundos,
 * ex.: 2026-03-19T12:31:54.000-0300. O Brasil não tem horário de verão desde 2019.
 */
export function formatarDataML(data: Date): string {
  return new Date(data.getTime() - UTC_MENOS_3_MS).toISOString().replace('Z', '-0300');
}
