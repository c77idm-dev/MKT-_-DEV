/**
 * Valor em reais, não negativo, em dois formatos sem ambiguidade:
 * - com vírgula: a vírgula é o decimal e os pontos são milhar ("1.234,56", "12,5");
 * - sem vírgula: um único ponto seguido de 1 ou 2 dígitos é decimal ("12.5", "1234.56", como o Excel entrega);
 *   pontos em grupos de 3 dígitos são milhar ("1.234", "1.234.567").
 * Qualquer outra forma é inválida. Aceita prefixo "R$". Devolve com 2 casas e ponto ("1234.56"), ou null.
 */
export function interpretarValor(texto: string): string | null {
  const s = texto.trim().replace(/^R\$/i, '').replace(/\s/g, '');
  if (s === '') return null;
  let normal: string;
  if (s.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(s)) return null;
    normal = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(s)) {
    normal = s;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normal = s.replace(/\./g, '');
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

/** "3", "3.0" ou "3,0" → 3 (o Excel às vezes manda inteiros com ".0"). Outros textos → null. */
export function interpretarInteiro(texto: string): number | null {
  const s = texto.trim().replace(',', '.');
  if (!/^\d+(\.0+)?$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

/** "05/11/2026", "5/11/2026" ou "2026-11-05" → "2026-11-05". Datas que não existem → null. */
export function interpretarData(texto: string): string | null {
  const s = texto.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const partes = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!partes) return null;
  const [ano, mes, dia] = partes.map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
