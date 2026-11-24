import { ehCodigoRetirada } from '@/modules/retiradas/dominio';

/**
 * (extra, emenda E25) Complemento do rótulo de um evento, lido dos dados dele, para o histórico da devolução (tela e
 * dossiê). Os rótulos em `rotulos/` continuam congelados; aqui só entra o que depende dos dados.
 * - "recebida" com `voltouDoArmazemML`: o pacote que o ML mandou de volta do armazém dele chegou na recepção.
 * - (extra, E27) "recebida" com `retiradaFull`: a chegada foi dada pela etiqueta amarela na Retirada do Full (RF-…).
 */
export function complementoDoEvento(acao: string, dados: Record<string, unknown> | null): string | null {
  if (acao !== 'recebida' || !dados) return null;
  const partes: string[] = [];
  if (dados.voltouDoArmazemML === true) partes.push('(voltou do armazém do ML)');
  if (typeof dados.retiradaFull === 'string' && ehCodigoRetirada(dados.retiradaFull)) partes.push(`(pela Retirada do Full ${dados.retiradaFull})`);
  return partes.length > 0 ? partes.join(' ') : null;
}
