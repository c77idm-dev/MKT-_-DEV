/** Normalização e validação dos documentos e códigos do cadastro (spec §5.1 e §6.8). Funções puras. */

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Maiúsculas, só 0-9 e A-Z (tira pontuação, espaços e acentos). Base do CNPJ alfanumérico e das buscas por documento. */
export function somenteAlfanumericos(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Valor de cada caractere no cálculo do dígito: '0'..'9' valem 0..9 e 'A'..'Z' valem 17..42 (código ASCII − 48). */
function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((total, c, i) => total + (c.charCodeAt(0) - 48) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ numérico ou alfanumérico: 12 caracteres [0-9A-Z] e 2 dígitos verificadores. */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const dv1 = digitoVerificador(cnpj.slice(0, 12), PESOS_DV1);
  const dv2 = digitoVerificador(cnpj.slice(0, 12) + dv1, PESOS_DV2);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

/** Tira a pontuação e devolve os 14 caracteres, ou null se for inválido. Repõe os zeros à esquerda que o Excel come. */
export function normalizarCnpj(texto: string): string | null {
  let limpo = somenteAlfanumericos(texto);
  if (/^\d{12,13}$/.test(limpo)) limpo = limpo.padStart(14, '0');
  return cnpjValido(limpo) ? limpo : null;
}

export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/** GTIN-8, 12, 13 ou 14 com o dígito verificador certo. */
export function normalizarEan(texto: string): string | null {
  const d = somenteDigitos(texto);
  if (![8, 12, 13, 14].includes(d.length)) return null;
  const corpo = d.slice(0, -1).split('').reverse();
  const soma = corpo.reduce((total, c, i) => total + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  const dv = (10 - (soma % 10)) % 10;
  return dv === Number(d[d.length - 1]) ? d : null;
}

export function normalizarNcm(texto: string): string | null {
  const d = somenteDigitos(texto);
  return d.length === 8 ? d : null;
}

export function normalizarCep(texto: string): string | null {
  let d = somenteDigitos(texto);
  if (d.length === 7) d = d.padStart(8, '0');
  return d.length === 8 ? d : null;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function normalizarUf(texto: string): string | null {
  const uf = texto.trim().toUpperCase();
  return (UFS as readonly string[]).includes(uf) ? uf : null;
}

/** O SKU é comparado sem diferenciar maiúsculas: fica aparado e em maiúsculas. */
export function normalizarSku(texto: string): string {
  return texto.trim().toUpperCase();
}
