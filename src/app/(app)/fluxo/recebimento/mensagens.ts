import type { AchadaPor } from '@/modules/devolucoes/recebimento';

/**
 * Texto do cartão "Chegada registrada": os códigos e a data, como sempre. (extra, E25) O pacote que voltou do armazém do
 * ML ganha o aviso logo depois do código: "DEV-000071 · voltou do armazém do ML (extra) · 23/11/2026 17:30".
 */
export function mensagemChegada(codigos: string[], doArmazemML: string[], quando: string): string {
  const partes = [codigos.join(', ')];
  if (doArmazemML.length > 0) {
    const verbo = doArmazemML.length > 1 ? 'voltaram' : 'voltou';
    const quais = doArmazemML.length === codigos.length ? '' : `${doArmazemML.join(', ')} `;
    partes.push(`${quais}${verbo} do armazém do ML (extra)`);
  }
  partes.push(quando);
  return partes.join(' · ');
}

/** (extra, E25) Por qual número da etiqueta do ML a devolução foi achada, quando não foi pelo rastreio. */
export function notaAchada(achadaPor: AchadaPor | undefined, quantas: number): string | undefined {
  if (!achadaPor) return undefined;
  const achada = quantas > 1 ? 'Achadas' : 'Achada';
  return `${achada} pelo número do ${achadaPor === 'PEDIDO_ML' ? 'pedido' : 'envio'} do ML (extra).`;
}

/**
 * (extra, E25) Mensagem e nota juntas para o anúncio do leitor de tela. A mensagem de chegada termina na hora, sem
 * pontuação; o ponto no meio faz o leitor dar a pausa antes da nota.
 */
export function mensagemComNota(mensagem: string, nota: string | undefined): string {
  if (!nota) return mensagem;
  return `${mensagem}${/[.!?]$/.test(mensagem) ? ' ' : '. '}${nota}`;
}
