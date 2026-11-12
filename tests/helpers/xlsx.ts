import { strToU8, zipSync } from 'fflate';

export function paraArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copia = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copia).set(bytes);
  return copia;
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function celula(valor: string | number | null, linha: number, coluna: number): string {
  if (valor === null) return '';
  const ref = `${String.fromCharCode(65 + coluna)}${linha + 1}`;
  if (typeof valor === 'number') return `<c r="${ref}"><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapar(valor)}</t></is></c>`;
}

/** Monta em memória um .xlsx mínimo (uma aba, textos inline e números), como o Excel salvaria. */
export function criarXlsx(linhas: (string | number | null)[][]): ArrayBuffer {
  const dados = linhas
    .map((linha, r) => `<row r="${r + 1}">${linha.map((v, c) => celula(v, r, c)).join('')}</row>`)
    .join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const arquivos = {
    '[Content_Types].xml': strToU8(
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${xml}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${dados}</sheetData></worksheet>`,
    ),
  };
  return paraArrayBuffer(zipSync(arquivos));
}
