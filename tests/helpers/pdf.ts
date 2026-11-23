import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFPage } from 'pdf-lib';

function fluxosDaPagina(doc: PDFDocument, pagina: PDFPage): PDFRawStream[] {
  const conteudo = doc.context.lookup(pagina.node.get(PDFName.of('Contents')));
  if (conteudo instanceof PDFArray) {
    return conteudo.asArray().map((r) => doc.context.lookup(r)).filter((s): s is PDFRawStream => s instanceof PDFRawStream);
  }
  return conteudo instanceof PDFRawStream ? [conteudo] : [];
}

/**
 * Texto de cada página, uma linha por desenho de texto (Tj). As fontes padrão do pdf-lib gravam o texto em WinAnsi,
 * que coincide com o Latin-1 nas letras acentuadas do pt-BR: "ê" volta como "ê", e o "?" de um caractere trocado aparece.
 */
export async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((pagina) =>
    fluxosDaPagina(doc, pagina)
      .map((fluxo) => Buffer.from(decodePDFRawStream(fluxo).decode()).toString('latin1'))
      .flatMap((ops) => [...ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')))
      .join('\n'),
  );
}

export async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  return (await paginasDoPdf(bytes)).join('\n');
}

/** Largura e altura de cada imagem embutida. */
export async function imagensDoPdf(bytes: Uint8Array): Promise<{ largura: number; altura: number }[]> {
  const doc = await PDFDocument.load(bytes);
  const imagens: { largura: number; altura: number }[] = [];
  for (const [, objeto] of doc.context.enumerateIndirectObjects()) {
    if (!(objeto instanceof PDFRawStream) || objeto.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const numero = (chave: string) => (objeto.dict.get(PDFName.of(chave)) as PDFNumber).asNumber();
    imagens.push({ largura: numero('Width'), altura: numero('Height') });
  }
  return imagens;
}
