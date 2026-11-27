/**
 * Apagadas (extra, emenda E29). Sem imports com "@/": vale na tela do cliente e nos testes de unidade.
 * Spec §9 (com a E29): o que está apagado há mais de 90 dias sai de vez, com as fotos e os vídeos (`expurgarApagadas`).
 */
export const PRAZO_APAGADAS_DIAS = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quantos dias faltam para a tarefa diária apagar de vez (arredonda para cima; nunca menos de 0). */
export function diasParaSumir(apagadaEm: Date, agora: Date): number {
  const restante = apagadaEm.getTime() + PRAZO_APAGADAS_DIAS * DIA_MS - agora.getTime();
  return Math.max(0, Math.ceil(restante / DIA_MS));
}

export function textoSomeEm(dias: number): string {
  if (dias <= 0) return 'Some de vez hoje';
  return `Some de vez em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** A confirmação depois de apagar (devolução ou retirada). */
export function mensagemApagada(codigo: string): string {
  return `${codigo} apagada. Ela fica em Apagadas por ${PRAZO_APAGADAS_DIAS} dias.`;
}
