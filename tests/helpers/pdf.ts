import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFString, type PDFPage } from 'pdf-lib';

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

export type LinkDoPdf = { pagina: number; uri: string; x: number; y: number; largura: number; altura: number };

/** As anotações de link (Link com ação URI) de cada página, na ordem em que foram postas (1ª página = 1). */
export async function linksDoPdf(bytes: Uint8Array): Promise<LinkDoPdf[]> {
  const doc = await PDFDocument.load(bytes);
  const links: LinkDoPdf[] = [];
  doc.getPages().forEach((pagina, i) => {
    const anotacoes = pagina.node.Annots();
    if (!anotacoes) return;
    for (let k = 0; k < anotacoes.size(); k++) {
      const a = anotacoes.lookup(k, PDFDict);
      if (a.get(PDFName.of('Subtype')) !== PDFName.of('Link')) continue;
      const acao = a.lookup(PDFName.of('A'), PDFDict);
      if (acao.get(PDFName.of('S')) !== PDFName.of('URI')) continue;
      const uri = acao.lookup(PDFName.of('URI'));
      const texto = uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : String(uri);
      const [x1, y1, x2, y2] = a.lookup(PDFName.of('Rect'), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
      links.push({ pagina: i + 1, uri: texto, x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 });
    }
  });
  return links;
}
