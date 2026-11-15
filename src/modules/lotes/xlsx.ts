import { strToU8, zipSync } from 'fflate';
import { COLUNAS_LISTA, cabecalhoDaLista, celulasDaLinha, type ListaConsolidada } from './lista-consolidada';

type Celula = string | number | null;

/** Troca & < > " e remove os caracteres que o XML 1.0 não aceita. */
function escaparXml(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function celula(valor: Celula, linha: number, coluna: number): string {
  if (valor === null) return '';
  const ref = `${String.fromCharCode(65 + coluna)}${linha + 1}`;
  if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
}

/** Monta em memória um .xlsx mínimo (uma aba): textos sempre inline (nunca fórmula) e números. */
export function gerarXlsx(nomeAba: string, linhas: Celula[][]): Uint8Array {
  const dados = linhas
    .map((linha, r) => `<row r="${r + 1}">${linha.map((v, c) => celula(v, r, c)).join('')}</row>`)
    .join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const aba = escaparXml(nomeAba.slice(0, 31));
  return zipSync({
    '[Content_Types].xml': strToU8(
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${aba}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${xml}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${dados}</sheetData></worksheet>`,
    ),
  });
}

/** Cabeçalho do fornecedor e da NF, uma linha vazia, as colunas da spec §6.5 e uma linha por unidade. */
export function planilhaDaLista(l: ListaConsolidada): Celula[][] {
  return [
    ...cabecalhoDaLista(l).map(([rotulo, valor]): Celula[] => [rotulo, valor]),
    [],
    [...COLUNAS_LISTA],
    ...l.linhas.map((x): Celula[] => celulasDaLinha(x)),
  ];
}
