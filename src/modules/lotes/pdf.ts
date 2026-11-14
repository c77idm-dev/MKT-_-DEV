import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { COLUNAS_LISTA, cabecalhoDaLista, type ListaConsolidada } from './lista-consolidada';

const WIN_ANSI_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));

/** Helvetica padrão só desenha WinAnsi: o resto vira "?" (um por caractere visível, decisão 22). */
export function paraWinAnsi(texto: string): string {
  return Array.from(texto)
    .map((c) => {
      const n = c.codePointAt(0) ?? 0;
      if (c === '\n' || (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_ANSI_EXTRA.has(c)) return c;
      return '?';
    })
    .join('');
}

const LARGURA = 842;
const ALTURA = 595;
const MARGEM = 36;
const TAMANHO = 9;
const ENTRELINHA = 12;
const LARGURAS = [90, 200, 100, 80, 80, 40, 180];
const LARGURA_TABELA = LARGURAS.reduce((a, b) => a + b, 0);
const PAD = 3;

function quebrar(texto: string, fonte: PDFFont, largura: number): string[] {
  const limpo = paraWinAnsi(texto).replace(/\n/g, ' ');
  const linhas: string[] = [];
  let atual = '';
  const cabe = (t: string) => fonte.widthOfTextAtSize(t, TAMANHO) <= largura;
  for (const palavra of limpo.split(/\s+/)) {
    let resto = palavra;
    const tentativa = atual ? `${atual} ${resto}` : resto;
    if (cabe(tentativa)) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = '';
    while (!cabe(resto)) {
      let corte = resto.length - 1;
      while (corte > 1 && !cabe(resto.slice(0, corte))) corte -= 1;
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    atual = resto;
  }
  linhas.push(atual);
  return linhas;
}

export async function gerarPdfLista(l: ListaConsolidada): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Lista consolidada ${l.lote.codigo}`);
  doc.setCreator('Gestão de Devoluções');
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let pagina = doc.addPage([LARGURA, ALTURA]);
  paginas.push(pagina);
  let y = ALTURA - MARGEM;
  const texto = (t: string, x: number, yy: number, f: PDFFont, tamanho = TAMANHO) =>
    pagina.drawText(paraWinAnsi(t), { x, y: yy, size: tamanho, font: f, color: rgb(0, 0, 0) });

  texto('Lista consolidada', MARGEM, y - 14, negrito, 16);
  y -= 34;
  for (const [rotulo, valor] of cabecalhoDaLista(l)) {
    texto(`${rotulo}:`, MARGEM, y - TAMANHO, negrito);
    texto(valor, MARGEM + 100, y - TAMANHO, fonte);
    y -= ENTRELINHA;
  }
  y -= 10;

  const cabecalhoTabela = () => {
    let x = MARGEM;
    pagina.drawRectangle({ x: MARGEM, y: y - ENTRELINHA - PAD, width: LARGURA_TABELA, height: ENTRELINHA + PAD, color: rgb(0.9, 0.9, 0.9) });
    COLUNAS_LISTA.forEach((nome, i) => {
      texto(nome, x + PAD, y - TAMANHO - 2, negrito);
      x += LARGURAS[i];
    });
    y -= ENTRELINHA + PAD + 2;
  };
  cabecalhoTabela();

  for (const linha of l.linhas) {
    const celulas = [linha.sku, linha.descricao, linha.serial, linha.motivo, linha.devolucao, String(linha.unidade), linha.observacao];
    const quebradas = celulas.map((c, i) => quebrar(c, fonte, LARGURAS[i] - 2 * PAD));
    const altura = Math.max(...quebradas.map((q) => q.length)) * ENTRELINHA + PAD;
    if (y - altura < MARGEM + 14) {
      pagina = doc.addPage([LARGURA, ALTURA]);
      paginas.push(pagina);
      y = ALTURA - MARGEM;
      cabecalhoTabela();
    }
    let x = MARGEM;
    quebradas.forEach((q, i) => {
      q.forEach((t, k) => texto(t, x + PAD, y - TAMANHO - k * ENTRELINHA, fonte));
      x += LARGURAS[i];
    });
    y -= altura;
    pagina.drawLine({ start: { x: MARGEM, y: y + 1 }, end: { x: MARGEM + LARGURA_TABELA, y: y + 1 }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
  }

  paginas.forEach((p, i) => {
    p.drawText(`Página ${i + 1} de ${paginas.length}`, { x: LARGURA - MARGEM - 70, y: MARGEM - 14, size: TAMANHO, font: fonte, color: rgb(0.3, 0.3, 0.3) });
  });
  return doc.save();
}
