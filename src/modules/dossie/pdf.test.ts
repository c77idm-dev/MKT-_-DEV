import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imagensDoPdf, linksDoPdf, paginasDoPdf, textoDoPdf } from '../../../tests/helpers/pdf';
import { dadosDossieTeste as dadosTeste } from '../../../tests/helpers/fabricas-dossie';
import { MAX_FOTOS_DOSSIE, type DadosDossie, type OpcoesImagem } from './dominio';
import { reduzirImagem, type ImagemPdf } from './imagens';
import { gerarPdfDossie, type MidiasDossie } from './pdf';

/** Uma foto 2000×1500 reduzida pelo reduzirImagem de verdade, uma vez por tamanho (o mozjpeg é lento). */
const reduzidas = new Map<string, Promise<ImagemPdf>>();
function fotoReduzida(opcoes: OpcoesImagem): Promise<ImagemPdf> {
  const chave = `${opcoes.ladoMaior}/${opcoes.qualidade}`;
  if (!reduzidas.has(chave)) {
    const base = sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 90, g: 140, b: 120 } } }).jpeg().toBuffer();
    reduzidas.set(chave, base.then((b) => reduzirImagem(b, opcoes)));
  }
  return reduzidas.get(chave)!;
}

/** Foto de ruído (não comprime): bem mais pesada que a estimativa por foto, para forçar a 2ª tentativa. */
const pesadas = new Map<string, Promise<ImagemPdf>>();
function fotoPesada(opcoes: OpcoesImagem): Promise<ImagemPdf> {
  const chave = `${opcoes.ladoMaior}/${opcoes.qualidade}`;
  if (!pesadas.has(chave)) {
    const base = sharp(randomBytes(1600 * 1200 * 3), { raw: { width: 1600, height: 1200, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    pesadas.set(chave, base.then((b) => reduzirImagem(b, opcoes)));
  }
  return pesadas.get(chave)!;
}

function midiasTeste(
  o: { fotoFalha?: string[]; semQuadro?: boolean; pesadas?: boolean; aoPedirFoto?: (n: number) => void } = {},
): MidiasDossie & { chamadas: { id: string; opcoes: OpcoesImagem }[] } {
  const chamadas: { id: string; opcoes: OpcoesImagem }[] = [];
  const imagem = o.pesadas ? fotoPesada : fotoReduzida;
  return {
    chamadas,
    async foto(e, opcoes) {
      chamadas.push({ id: e.id, opcoes });
      o.aoPedirFoto?.(chamadas.length);
      if (o.fotoFalha?.includes(e.id)) return { ok: false, motivo: 'Arquivo não encontrado no armazenamento.' };
      return { ok: true, imagem: await imagem(opcoes) };
    },
    async quadroDoVideo(_e, opcoes) {
      chamadas.push({ id: 'quadro', opcoes });
      if (o.semQuadro) return { imagem: null, duracaoSegundos: null, problema: 'Não foi possível tirar um quadro do vídeo.' };
      return { imagem: await imagem(opcoes), duracaoSegundos: 42.4, problema: null };
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fotos da avaria a mais na unidade 1, para passar da estimativa de tamanho ou do teto de fotos. */
function comMuitasFotos(n: number) {
  const dados = dadosTeste();
  for (let i = 0; i < n; i++) {
    dados.evidencias.push({ ...dados.evidencias[4], id: `avx${i}` });
  }
  return dados;
}

describe('gerarPdfDossie (extra)', () => {
  it('gera um PDF válido, com as seções em ordem, cada uma começando numa página', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    expect(Buffer.from(r.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(r.tamanho).toBe(r.bytes.length);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getTitle()).toBe('Dossiê de provas DEV-000123');
    expect(doc.getPageCount()).toBe(r.paginas);
    expect(r.secoes.map((s) => s.titulo)).toEqual([
      'Dossiê de provas',
      'Pacote',
      'Unidade 1 de 3',
      'Unidade 2 de 3',
      'Unidade 3 de 3',
      'Vídeo de Prova',
    ]);
    const paginasDasSecoes = r.secoes.map((s) => s.pagina);
    expect(paginasDasSecoes[0]).toBe(1);
    for (let i = 1; i < paginasDasSecoes.length; i++) expect(paginasDasSecoes[i]).toBeGreaterThan(paginasDasSecoes[i - 1]);
    const paginas = await paginasDoPdf(r.bytes);
    for (const s of r.secoes) expect(paginas[s.pagina - 1]).toContain(s.titulo);
    // Rodapé em todas as páginas: código, quando foi gerado (sem quem: E28) e a numeração.
    paginas.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${r.paginas}`);
      expect(p).toContain('DEV-000123 · Dossiê de provas · gerado em 19/11/2026 15:30');
      expect(p).not.toMatch(/gerado em [^\n]* por /);
    });
    // Índice na capa: pacote, unidades e vídeo (sem as linhas do histórico e da integridade: E28).
    expect(paginas[0]).toContain('Conteúdo');
    expect(paginas[0]).toContain(`página ${r.secoes[1].pagina}`);
    for (const linha of ['Pacote (Fotos 1 e 2)', 'Unidades 1 a 3', 'Vídeo de Prova']) expect(paginas[0]).toContain(linha);
  });

  it('escreve os acentos do pt-BR (WinAnsi), sem trocar letras por "?"', async () => {
    const texto = await textoDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    for (const trecho of ['Dossiê de provas', 'Código de rastreamento', 'Início da conferência', 'Não veio no pacote (ausente)', 'Vídeo de Prova', 'Fone Bluetooth Ação']) {
      expect(texto).toContain(trecho);
    }
    expect(texto).not.toMatch(/\p{L}\?\p{L}/u);
  });

  it('capa: canal, venda e reclamação do ML, rastreio, motivos, chegada e conferência (sem os nomes: E28)', async () => {
    const [capa] = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    for (const trecho of [
      'Loja Exemplo Ltda',
      'Gestão de Devoluções',
      'DEV-000123',
      'Mercado Livre',
      '2000009876543210',
      '5300000001',
      '91000001',
      'Loja Falsa 1',
      'BR123456789',
      'Correios',
      'Motivo do cliente',
      'Produto não funciona',
      'Motivo da reclamação no ML',
      'Chegou com defeito (PDD9949)',
      '19/11/2026 10:00',
      'Início da conferência',
      '19/11/2026 10:01',
      'Fim da conferência',
      '19/11/2026 10:20',
      'Gerado pelo sistema Gestão de Devoluções em 19/11/2026 15:30.',
    ]) {
      expect(capa).toContain(trecho);
    }
    for (const fora of ['Recebida por', 'Conferente']) expect(capa).not.toContain(fora);
  });

  it('capa de devolução fora do ML: sem os campos do ML', async () => {
    const [capa] = await paginasDoPdf(
      (await gerarPdfDossie(dadosTeste({ canal: 'SHOPEE', reclamacaoId: null, devolucaoExternaId: null, contaML: null, motivoReclamacaoML: null }), midiasTeste())).bytes,
    );
    expect(capa).toContain('Shopee');
    expect(capa).toContain('Número do pedido');
    expect(capa).not.toContain('Motivo da reclamação no ML');
  });

  it('cada unidade: produto esperado, leitura do código, S/N, lote, validade, destino, observação e as fotos', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const daSecao = (titulo: string) => {
      const i = r.secoes.findIndex((s) => s.titulo === titulo);
      return paginas.slice(r.secoes[i].pagina - 1, r.secoes[i + 1].pagina - 1).join('\n');
    };
    const u1 = daSecao('Unidade 1 de 3');
    for (const trecho of [
      'FONE-01', 'Fone Bluetooth Ação', '7891000000014', 'Confere', 'SN-ABC-1', 'L2026', '12/2027',
      'Estoque Problema · Avariado', 'Caixa amassada e tela trincada.', 'Foto 3', 'Foto 4', 'Fotos da avaria', 'Foto da avaria 1', 'Foto da avaria 2',
    ]) {
      expect(u1).toContain(trecho);
    }
    const u2 = daSecao('Unidade 2 de 3');
    expect(u2).toContain('Não confere');
    expect(u2).toContain('CAPA-09 · Capa de silicone');
    expect(u2).toContain('Estoque Problema · Divergente');
    expect(daSecao('Unidade 3 de 3')).toContain('Não veio no pacote (ausente)');
    // Foto lida, sem leitura do código.
    const semLeitura = dadosTeste();
    semLeitura.unidades[0] = { ...semLeitura.unidades[0], eanLido: null };
    expect(await textoDoPdf((await gerarPdfDossie(semLeitura, midiasTeste())).bytes)).toContain('Não lido');
  });

  it('código lido sem EAN de referência (produto sem EAN ou SKU fora do cadastro): nunca "Confere"', async () => {
    for (const descricao of ['Fone Bluetooth Ação', null]) {
      const dados = dadosTeste();
      dados.unidades = [{ ...dados.unidades[0], descricao, eanEsperado: null, eanLido: '7891000000014', divergente: false }];
      const r = await gerarPdfDossie(dados, midiasTeste());
      const paginas = await paginasDoPdf(r.bytes);
      const i = r.secoes.findIndex((s) => s.titulo === 'Unidade 1 de 1');
      const unidade = paginas.slice(r.secoes[i].pagina - 1, r.secoes[i + 1].pagina - 1).join('\n');
      expect(unidade).toContain('7891000000014 · Sem EAN de referência no cadastro (não comparado)');
      expect(unidade).not.toMatch(/· Confere/);
    }
  });

  it('o subtítulo de uma grade de fotos não fica sozinho no pé da página', async () => {
    const paginas = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    const comSubtitulo = paginas.filter((p) => p.split('\n').includes('Fotos da avaria'));
    expect(comSubtitulo).toHaveLength(1);
    expect(comSubtitulo[0]).toContain('Foto da avaria 1');
  });

  it('pacote e unidades levam o carimbo de cada foto (data e hora da captura e o código, sem o nome: E28)', async () => {
    const paginas = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    expect(paginas[1]).toContain('Foto 1');
    expect(paginas[1]).toContain('Etiqueta de rastreio e declaração de conteúdo');
    expect(paginas[1]).toContain('Foto 2');
    expect(paginas[1]).toContain('Carimbo: 19/11/2026 10:02 · DEV-000123');
    expect(paginas[1]).not.toContain('Operador Teste');
  });

  it('vídeo: um quadro, a data e a duração, e o aviso de que vai em arquivo separado', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const video = paginas[r.secoes.find((s) => s.titulo === 'Vídeo de Prova')!.pagina - 1];
    expect(video).toContain('Data da gravação');
    expect(video).toContain('19/11/2026 10:02');
    expect(video).toContain('Duração');
    expect(video).toContain('0:42');
    expect(video).toContain('O vídeo vai em arquivo separado.');
    expect(video).toMatch(/Mercado Livre não aceita vídeo/);
    expect(video).toMatch(/dentro do PDF/);
    expect(video).toContain('Situação');
    expect(video).not.toContain('Enviado por');
  });

  it('sem o histórico e sem a integridade dos arquivos (SHA-256), nem nos metadados (E28)', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const texto = await textoDoPdf(r.bytes);
    for (const fora of ['Histórico', 'Integridade', 'integridade', 'SHA-256', 'Devolução cadastrada', 'Conferência concluída', 'Teste de motivo']) {
      expect(texto, fora).not.toContain(fora);
    }
    // Nenhum hash no texto (nem os guardados nem os calculados).
    expect(texto).not.toMatch(/\b[0-9a-f]{64}\b/);
    const doc = await PDFDocument.load(r.bytes);
    for (const meta of [doc.getTitle(), doc.getSubject(), doc.getKeywords(), doc.getAuthor(), doc.getCreator(), doc.getProducer()]) {
      expect(meta ?? '').not.toMatch(/SHA-256|integridade|histórico/i);
    }
  });

  it('nenhum nome de pessoa: sem "Recebida por", "Conferente", "Enviado por", "gerado … por" nem autor nos metadados (E28)', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const texto = await textoDoPdf(r.bytes);
    for (const fora of ['Recebida por', 'Conferente', 'Enviado por', 'Recebido em', 'Gestora Teste', 'Operador Teste', 'Recebedor Teste', 'usuário removido']) {
      expect(texto, fora).not.toContain(fora);
    }
    expect(texto).not.toMatch(/[Gg]erado [^\n]* por /);
    expect((await PDFDocument.load(r.bytes)).getAuthor()).toBeUndefined();
  });

  it('sem a foto do anúncio do ML nem a nota "Referência do anúncio (não é prova)" (E28)', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const texto = (await textoDoPdf(r.bytes)).replace(/\s+/g, ' ');
    for (const fora of ['Foto do anúncio', 'anúncio', 'não é prova', 'Compare com as fotos da unidade']) expect(texto, fora).not.toContain(fora);
    // Só as 8 fotos da conferência e o quadro do vídeo.
    expect(await imagensDoPdf(r.bytes)).toHaveLength(9);
  });

  it('mídia faltando ou que não ficou pronta não quebra o PDF: aviso no lugar', async () => {
    const dados = dadosTeste();
    dados.evidencias = dados.evidencias
      .filter((e) => e.id !== 'f2' && e.tipo !== 'VIDEO_PROVA')
      .map((e) => (e.id === 'f3u1' ? { ...e, situacao: 'PROCESSANDO' as const, caminho: null, sha256Final: null } : e))
      .map((e) => (e.id === 'f4u1' ? { ...e, situacao: 'FALHOU' as const, caminho: null, sha256Final: null } : e));
    const midias = midiasTeste({ fotoFalha: ['f1'] });
    const texto = await textoDoPdf((await gerarPdfDossie(dados, midias)).bytes);
    expect(texto).toContain('Arquivo não encontrado no armazenamento.');
    expect(texto).toContain('Foto 2 não enviada.');
    expect(texto).toContain('Ainda em processamento');
    expect(texto).toContain('O processamento falhou');
    expect(texto).toContain('Esta devolução não tem Vídeo de Prova.');
    // Só pede ao armazenamento o que está pronto.
    expect(midias.chamadas.map((c) => c.id)).not.toContain('f3u1');
    expect(midias.chamadas.map((c) => c.id)).not.toContain('f4u1');

    const semQuadro = await textoDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste({ semQuadro: true }))).bytes);
    expect(semQuadro).toContain('Não foi possível tirar um quadro do vídeo.');
  });

  it('as imagens entram reduzidas (até 1280 px) e o PDF fica abaixo do limite numa tentativa só', async () => {
    const midias = midiasTeste();
    const r = await gerarPdfDossie(dadosTeste(), midias);
    expect(r.tentativas).toBe(1);
    expect(r.opcoes).toEqual({ ladoMaior: 1280, qualidade: 70 });
    const imagens = await imagensDoPdf(r.bytes);
    expect(imagens.length).toBe(9); // 8 fotos + o quadro do vídeo
    for (const i of imagens) expect(Math.max(i.largura, i.altura)).toBeLessThanOrEqual(1280);
    expect(new Set(midias.chamadas.map((c) => c.opcoes.ladoMaior))).toEqual(new Set([1280]));
  });

  it('acima do limite (fotos mais pesadas que a estimativa), refaz uma vez com 1024 px e qualidade 60', async () => {
    const midias = midiasTeste({ pesadas: true });
    // 9 imagens × 170 KB cabem em 2 MB pela estimativa; as fotos de ruído passam disso.
    const r = await gerarPdfDossie(dadosTeste(), midias, { limiteBytes: 2 * 1024 * 1024 });
    expect(r.tentativas).toBe(2);
    expect(r.opcoes).toEqual({ ladoMaior: 1024, qualidade: 60 });
    expect(midias.chamadas.filter((c) => c.opcoes.ladoMaior === 1280)).toHaveLength(9);
    expect(midias.chamadas.filter((c) => c.opcoes.ladoMaior === 1024 && c.opcoes.qualidade === 60)).toHaveLength(9);
    for (const i of await imagensDoPdf(r.bytes)) expect(Math.max(i.largura, i.altura)).toBeLessThanOrEqual(1024);
    expect(Buffer.from(r.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('muitas fotos (a estimativa passa de 8 MB): já começa em 1024 px/60, numa tentativa só', async () => {
    const midias = midiasTeste();
    const r = await gerarPdfDossie(comMuitasFotos(45), midias); // 53 fotos + o quadro: 54 × 170 KB > 8 MB
    expect(r.tentativas).toBe(1);
    expect(r.opcoes).toEqual({ ladoMaior: 1024, qualidade: 60 });
    expect(new Set(midias.chamadas.map((c) => `${c.opcoes.ladoMaior}/${c.opcoes.qualidade}`))).toEqual(new Set(['1024/60']));
    expect(await imagensDoPdf(r.bytes)).toHaveLength(54);
  });

  it('teto de fotos por PDF: as de cima viram aviso (sem ler o arquivo)', async () => {
    expect(MAX_FOTOS_DOSSIE).toBe(120);
    const dados = comMuitasFotos(2); // 10 fotos no corpo
    const midias = midiasTeste();
    const r = await gerarPdfDossie(dados, midias, { maxFotos: 7 });
    expect(midias.chamadas.filter((c) => c.id !== 'quadro')).toHaveLength(7);
    expect(await imagensDoPdf(r.bytes)).toHaveLength(8); // 7 fotos + o quadro do vídeo
    const paginas = await paginasDoPdf(r.bytes);
    expect(paginas[0]).toContain('3 fotos não entraram neste PDF: veja no sistema.');
    const texto = paginas.join('\n');
    expect(texto.match(/Foto fora deste PDF \(limite de 7 fotos\)/g)).toHaveLength(3);
  });

  it('dossiê cancelado (o pedido foi embora): para entre uma foto e outra', async () => {
    const controle = new AbortController();
    const midias = midiasTeste({ aoPedirFoto: (n) => n === 2 && controle.abort(new Error('foi embora')) });
    await expect(gerarPdfDossie(dadosTeste(), midias, { sinal: controle.signal })).rejects.toThrow('foi embora');
    expect(midias.chamadas).toHaveLength(2);
    const cancelado = new AbortController();
    cancelado.abort(new Error('antes'));
    const nenhuma = midiasTeste();
    await expect(gerarPdfDossie(dadosTeste(), nenhuma, { sinal: cancelado.signal })).rejects.toThrow('antes');
    expect(nenhuma.chamadas).toHaveLength(0);
  });

  it('fotos extras do pacote (sem unidade) entram na seção Pacote', async () => {
    const dados = dadosTeste();
    dados.evidencias.push({ ...dados.evidencias[0], id: 'extra-pacote', tipo: 'EXTRA', itemId: null });
    const r = await gerarPdfDossie(dados, midiasTeste());
    expect(await imagensDoPdf(r.bytes)).toHaveLength(10);
    const paginas = await paginasDoPdf(r.bytes);
    const i = r.secoes.findIndex((s) => s.titulo === 'Pacote');
    const pacote = paginas.slice(r.secoes[i].pagina - 1, r.secoes[i + 1].pagina - 1).join('\n');
    expect(pacote).toContain('Fotos extras do pacote');
    expect(pacote).toContain('Foto extra 1');
  });

  it('caractere fora do WinAnsi (emoji) vira "?" em vez de erro', async () => {
    const dados = dadosTeste();
    dados.unidades[0] = { ...dados.unidades[0], observacao: 'Caixa amassada 📦' };
    await expect(gerarPdfDossie(dados, midiasTeste())).resolves.toMatchObject({ tentativas: 1 });
  });
});

describe('links das provas no PDF (E28: a foto e o vídeo abrem pelo PDF, sem login)', () => {
  const ORIGEM = 'https://devolucoes.exemplo.com.br';
  /** O que o gerar.ts monta: a foto abre o arquivo; o vídeo, a página que toca. */
  function linksDe(d: DadosDossie): Map<string, string> {
    return new Map(
      d.evidencias.map((x) => [x.id, `${ORIGEM}/api/provas/${x.tipo === 'VIDEO_PROVA' ? 'video' : 'arquivo'}?e=${x.id}&exp=1&sig=abc_-`]),
    );
  }
  const paginaDe = (r: Awaited<ReturnType<typeof gerarPdfDossie>>, titulo: string) => r.secoes.find((s) => s.titulo === titulo)!.pagina;

  it('cada foto da conferência e o quadro do vídeo viram link; o vídeo ganha o link visível "Assistir ao vídeo"', async () => {
    const dados = dadosTeste();
    const links = linksDe(dados);
    const r = await gerarPdfDossie(dados, midiasTeste(), { links });
    const anotacoes = await linksDoPdf(r.bytes);
    // 8 fotos + o quadro do vídeo + o "Assistir ao vídeo".
    expect(anotacoes).toHaveLength(10);
    for (const x of dados.evidencias.filter((e) => e.tipo !== 'VIDEO_PROVA')) {
      const daFoto = anotacoes.filter((a) => a.uri === links.get(x.id));
      expect(daFoto, x.id).toHaveLength(1);
      // A caixa da foto inteira (o toque em qualquer ponto da foto abre).
      expect(daFoto[0].altura).toBeGreaterThanOrEqual(200);
    }
    expect(anotacoes.filter((a) => a.uri === links.get('f1'))[0].pagina).toBe(paginaDe(r, 'Pacote'));
    expect(anotacoes.filter((a) => a.uri === links.get('f3u2'))[0].pagina).toBe(paginaDe(r, 'Unidade 2 de 3'));

    const doVideo = anotacoes.filter((a) => a.uri === links.get('video'));
    expect(doVideo).toHaveLength(2);
    const paginaVideo = paginaDe(r, 'Vídeo de Prova');
    for (const a of doVideo) expect(a.pagina).toBe(paginaVideo);
    const [quadro, texto] = [...doVideo].sort((a, b) => b.altura - a.altura);
    expect(quadro.altura).toBeGreaterThanOrEqual(280); // a caixa do quadro
    expect(texto.altura).toBeLessThan(40); // a linha do "Assistir ao vídeo", logo abaixo do quadro
    expect(texto.y).toBeLessThan(quadro.y);
    const paginas = await paginasDoPdf(r.bytes);
    expect(paginas[paginaVideo - 1]).toContain('Assistir ao vídeo');
    // Só os links das provas: nada do /api/arquivos (sessão) nem chave do armazenamento.
    for (const a of anotacoes) expect(a.uri).toMatch(new RegExp(`^${ORIGEM}/api/provas/(arquivo|video)[?]e=`));
  });

  it('o quadro do vídeo que não saiu continua com o link (o vídeo pode tocar)', async () => {
    const dados = dadosTeste();
    const r = await gerarPdfDossie(dados, midiasTeste({ semQuadro: true }), { links: linksDe(dados) });
    expect((await linksDoPdf(r.bytes)).filter((a) => a.uri.includes('/api/provas/video'))).toHaveLength(2);
    expect(await textoDoPdf(r.bytes)).toContain('Assistir ao vídeo');
  });

  it('sem links (sem o endereço público ou fora do disco): nenhum link e nada de "Assistir ao vídeo"; o PDF sai igual', async () => {
    for (const config of [{}, { links: new Map<string, string>() }]) {
      const r = await gerarPdfDossie(dadosTeste(), midiasTeste(), config);
      expect(await linksDoPdf(r.bytes)).toEqual([]);
      expect(await textoDoPdf(r.bytes)).not.toContain('Assistir ao vídeo');
      expect(await imagensDoPdf(r.bytes)).toHaveLength(9);
    }
  });

  it('só a prova pronta vira link (a que não ficou pronta, não, mesmo que venha no mapa)', async () => {
    const dados = dadosTeste();
    dados.evidencias = dados.evidencias.map((e) =>
      e.id === 'f2' || e.id === 'video' ? { ...e, situacao: 'PROCESSANDO' as const, caminho: null } : e,
    );
    const links = linksDe(dados);
    const r = await gerarPdfDossie(dados, midiasTeste(), { links });
    const uris = (await linksDoPdf(r.bytes)).map((a) => a.uri);
    expect(uris).toHaveLength(7);
    expect(uris).not.toContain(links.get('f2'));
    expect(uris).not.toContain(links.get('video'));
    expect(await textoDoPdf(r.bytes)).not.toContain('Assistir ao vídeo');
  });

  it('a foto acima do teto (aviso no lugar) continua abrindo pelo link', async () => {
    const dados = dadosTeste();
    const links = linksDe(dados);
    const r = await gerarPdfDossie(dados, midiasTeste(), { links, maxFotos: 6 });
    expect(await linksDoPdf(r.bytes)).toHaveLength(10);
  });

  it('os links continuam quando o PDF é refeito com imagens menores', async () => {
    const dados = dadosTeste();
    const r = await gerarPdfDossie(dados, midiasTeste({ pesadas: true }), { links: linksDe(dados), limiteBytes: 2 * 1024 * 1024 });
    expect(r.tentativas).toBe(2);
    expect(await linksDoPdf(r.bytes)).toHaveLength(10);
  });

  it('um link com caractere que quebraria o PDF (parêntese, barra invertida, espaço, acento) não entra', async () => {
    const dados = dadosTeste();
    const links = linksDe(dados);
    links.set('f1', `${ORIGEM}/api/provas/arquivo?e=(x)`);
    links.set('f2', `${ORIGEM}/api/provas/arquivo?e=a${String.fromCharCode(92)}b`);
    links.set('f3u1', `${ORIGEM}/api/provas/arquivo?e=a b`);
    links.set('f4u1', `${ORIGEM}/api/provas/arquivo?e=ação`);
    const r = await gerarPdfDossie(dados, midiasTeste(), { links });
    expect(await linksDoPdf(r.bytes)).toHaveLength(6);
  });
});
