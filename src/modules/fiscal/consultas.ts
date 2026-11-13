/** D12: a 1ª consulta vai logo depois do envio; depois 10 s, 30 s, 1 min, 2 min, 5 min e a cada 10 min. */
export const ESPERAS_CONSULTA_SEGUNDOS = [10, 30, 60, 120, 300] as const;
export const ESPERA_FINAL_SEGUNDOS = 600;
/** Cerca de 24 h de consultas. Passou disso, a tarefa falha e vai para a tela Falhas (Fase 6). */
export const LIMITE_CONSULTAS = 150;

export function esperaAntesDaConsulta(numero: number): number {
  if (numero <= 1) return 0;
  const espera: number | undefined = ESPERAS_CONSULTA_SEGUNDOS[numero - 2];
  return espera ?? ESPERA_FINAL_SEGUNDOS;
}
