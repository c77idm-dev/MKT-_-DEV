/** Chave de acesso da NF-e (44 dígitos): cUF, AAMM, CNPJ, modelo, série, número, tipo de emissão, código e dígito. */

export const CODIGO_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24',
  PB: '25', PE: '26', AL: '27', SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42',
  RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

const ANO_MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: '2-digit', month: '2-digit' });

/** Módulo 11 com pesos de 2 a 9 da direita para a esquerda; resto 0 ou 1 → 0. */
export function digitoChave(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave) && digitoChave(chave.slice(0, 43)) === chave[43];
}

export function montarChave(p: { uf: string; emitidaEm: Date; cnpj: string; modelo?: string; serie: string; numero: string; codigo: string }): string {
  const cUF = CODIGO_UF[p.uf];
  if (!cUF) throw new Error(`UF desconhecida: ${p.uf}`);
  const partes = Object.fromEntries(ANO_MES.formatToParts(p.emitidaEm).map((x) => [x.type, x.value]));
  const base = [
    cUF,
    `${partes.year}${partes.month}`,
    p.cnpj.padStart(14, '0'),
    p.modelo ?? '55',
    p.serie.padStart(3, '0'),
    p.numero.padStart(9, '0'),
    '1',
    p.codigo.padStart(8, '0'),
  ].join('');
  return base + digitoChave(base);
}

export function semPrefixoNFe(chave: string): string {
  return chave.trim().replace(/^NFe/i, '');
}

/** O número da nota (nNF) que está dentro da chave, sem os zeros à esquerda. */
export function numeroDaChave(chave: string): string {
  return String(Number(chave.slice(25, 34)));
}
