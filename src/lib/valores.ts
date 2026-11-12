/**
 * Valor em reais, não negativo: "1.234,56", "12,5", "12.5", "1,234.56" ou "R$ 89,90".
 * Devolve com 2 casas e ponto ("1234.56"), que é o formato da coluna numeric, ou null.
 */
export function interpretarValor(texto: string): string | null {
  const s = texto.trim().replace(/^R\$/i, '').replace(/\s/g, '');
  if (s === '') return null;
  let normal: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) {
    normal = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    normal = s.replace(/,/g, '');
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    normal = s;
  } else {
    return null;
  }
  const numero = Number(normal);
  return Number.isFinite(numero) ? numero.toFixed(2) : null;
}

/** Texto aparado; vazio vira null. Se passar do limite, anota o erro em `erros` e devolve null. */
export function textoOpcional(valor: string | undefined, max: number, rotulo: string, erros: string[]): string | null {
  const s = (valor ?? '').trim();
  if (s.length > max) {
    erros.push(`${rotulo}: no máximo ${max} caracteres`);
    return null;
  }
  return s === '' ? null : s;
}
