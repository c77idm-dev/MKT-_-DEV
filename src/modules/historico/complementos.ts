/**
 * (extra, emenda E25) Complemento do rótulo de um evento, lido dos dados dele, para o histórico da devolução (tela e
 * dossiê). Os rótulos em `rotulos/` continuam congelados; aqui só entra o que depende dos dados.
 * - "recebida" com `voltouDoArmazemML`: o pacote que o ML mandou de volta do armazém dele chegou na recepção.
 */
export function complementoDoEvento(acao: string, dados: Record<string, unknown> | null): string | null {
  if (acao === 'recebida' && dados?.voltouDoArmazemML === true) return '(voltou do armazém do ML)';
  return null;
}
