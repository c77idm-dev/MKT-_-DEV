import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/universal';

export type Planilha = { cabecalhos: string[]; linhas: string[][] };

export class ErroPlanilha extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPlanilha';
  }
}

export const MAX_LINHAS = 20_000;

/** Lê a planilha enviada (spec §6.8): CSV ou a primeira aba do XLSX. A primeira linha tem os nomes das colunas. */
export async function lerPlanilha(nomeArquivo: string, conteudo: ArrayBuffer): Promise<Planilha> {
  const extensao = nomeArquivo.toLowerCase().split('.').pop() ?? '';
  if (extensao === 'csv' || extensao === 'txt') return montarPlanilha(lerCsv(decodificarTexto(new Uint8Array(conteudo))));
  if (extensao === 'xlsx') return montarPlanilha(await lerXlsx(conteudo));
  if (extensao === 'xls') {
    throw new ErroPlanilha('Arquivos .xls (Excel antigo) não são aceitos. No Excel, use "Salvar como" .xlsx ou .csv.');
  }
  throw new ErroPlanilha('Envie um arquivo .csv ou .xlsx.');
}

/** UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252, que é como o Excel em português salva CSV. */
export function decodificarTexto(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^﻿/, '');
}

/**
 * O separador (";" do Excel brasileiro, "," ou tabulação) é detectado pelo papaparse.
 * A detecção roda só sobre as linhas não vazias: o papaparse 5.7 conta a linha vazia final como 1 campo
 * e não reconhece ";" em arquivos que terminam com quebra de linha.
 */
export function lerCsv(texto: string): string[][] {
  const amostra = texto
    .split(/\r?\n/)
    .filter((linha) => linha.trim() !== '')
    .slice(0, 10)
    .join('\n');
  const separador = Papa.parse<string[]>(amostra).meta.delimiter || ',';
  return Papa.parse<string[]>(texto, { delimiter: separador, skipEmptyLines: false }).data;
}

async function lerXlsx(conteudo: ArrayBuffer): Promise<unknown[][]> {
  try {
    // Números como texto: EAN e CNPJ não perdem dígitos nem zeros.
    return await readSheet(conteudo, { parseNumber: (texto: string) => texto });
  } catch {
    throw new ErroPlanilha('Não foi possível ler o arquivo .xlsx. Abra no Excel, salve de novo e tente outra vez.');
  }
}

export function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  return String(valor).trim();
}

function nomesUnicos(nomes: string[]): string[] {
  const vistos = new Map<string, number>();
  return nomes.map((nome) => {
    const vez = (vistos.get(nome) ?? 0) + 1;
    vistos.set(nome, vez);
    return vez === 1 ? nome : `${nome} (${vez})`;
  });
}

/** Transforma as linhas brutas em cabeçalhos + linhas de texto do mesmo tamanho, com as checagens de tamanho. */
export function montarPlanilha(brutas: unknown[][]): Planilha {
  const linhas = brutas.map((linha) => linha.map(celulaParaTexto));
  while (linhas.length > 0 && linhas[linhas.length - 1].every((c) => c === '')) linhas.pop();
  if (linhas.length === 0) throw new ErroPlanilha('A planilha está vazia.');
  const [primeira, ...dados] = linhas;
  while (primeira.length > 0 && primeira[primeira.length - 1] === '') primeira.pop();
  if (dados.length === 0) throw new ErroPlanilha('A planilha só tem a linha dos nomes das colunas.');
  if (dados.length > MAX_LINHAS) {
    throw new ErroPlanilha(`A planilha tem ${dados.length} linhas; o limite é ${MAX_LINHAS}. Divida o arquivo.`);
  }
  const cabecalhos = nomesUnicos(primeira.map((c, i) => c || `Coluna ${i + 1}`));
  return { cabecalhos, linhas: dados.map((linha) => cabecalhos.map((_, i) => linha[i] ?? '')) };
}
