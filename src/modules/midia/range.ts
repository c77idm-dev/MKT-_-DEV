export type Intervalo = { inicio: number; fim: number };

/**
 * Cabeçalho Range com um único intervalo ("bytes=0-", "bytes=100-199", "bytes=-500").
 * null = arquivo inteiro (sem cabeçalho ou malformado: ignorado, RFC 7233 §3.1); 'invalido' = sintaxe válida mas
 * insatisfazível, responder 416.
 */
export function interpretarRange(cabecalho: string | null, tamanho: number): Intervalo | null | 'invalido' {
  if (!cabecalho) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (tamanho === 0) return 'invalido';
  let inicio: number;
  let fim: number;
  if (m[1] === '') {
    const sufixo = Number(m[2]);
    if (sufixo === 0) return 'invalido';
    inicio = Math.max(0, tamanho - sufixo);
    fim = tamanho - 1;
  } else {
    inicio = Number(m[1]);
    fim = m[2] === '' ? tamanho - 1 : Math.min(Number(m[2]), tamanho - 1);
  }
  if (inicio >= tamanho || inicio > fim) return 'invalido';
  return { inicio, fim };
}
