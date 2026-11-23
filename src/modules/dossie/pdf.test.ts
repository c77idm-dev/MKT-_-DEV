import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imagensDoPdf, paginasDoPdf, textoDoPdf } from '../../../tests/helpers/pdf';
import { dadosDossieTeste as dadosTeste } from '../../../tests/helpers/fabricas-dossie';
import { baixarFotoAnuncio } from './anuncio';
import { IMAGEM_ANUNCIO, MAX_FOTOS_DOSSIE, PRAZO_FOTO_ANUNCIO_MS, type DadosDossie, type OpcoesImagem } from './dominio';
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

/** A foto do anúncio como o baixarFotoAnuncio a devolve: 1200×1200 reduzida a 400 px. */
let anuncioReduzido: Promise<ImagemPdf> | null = null;
function fotoDoAnuncioReduzida(): Promise<ImagemPdf> {
  anuncioReduzido ??= sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: 200, g: 60, b: 40 } } })
    .png()
    .toBuffer()
    .then((b) => reduzirImagem(b, IMAGEM_ANUNCIO));
  return anuncioReduzido;
}

function midiasTeste(
  o: {
    fotoFalha?: string[];
    semQuadro?: boolean;
    pesadas?: boolean;
    aoPedirFoto?: (n: number) => void;
    /**
     * ok: devolve a foto; falha: indisponível; demora: espera o prazo inteiro e desiste (servidor parado); lenta: desiste
     * depois de uns 15 ms; erro: rejeita com um erro comum (um bug, não o cancelamento do dossiê).
     */
    anuncio?: 'ok' | 'falha' | 'demora' | 'lenta' | 'erro';
    aoPedirAnuncio?: (n: number) => void;
  } = {},
): MidiasDossie & { chamadas: { id: string; opcoes: OpcoesImagem }[]; anuncios: { url: string; prazoMs: number }[] } {
  const chamadas: { id: string; opcoes: OpcoesImagem }[] = [];
  const anuncios: { url: string; prazoMs: number }[] = [];
  const imagem = o.pesadas ? fotoPesada : fotoReduzida;
  return {
    chamadas,
    anuncios,
    async fotoDoAnuncio(url, { prazoMs, sinal }) {
      anuncios.push({ url, prazoMs });
      o.aoPedirAnuncio?.(anuncios.length);
      sinal?.throwIfAborted();
      // O mesmo contrato do baixarFotoAnuncio de verdade: o prazo vira um AbortSignal.timeout (só aceita inteiro).
      const prazo = AbortSignal.timeout(prazoMs);
      if (o.anuncio === 'falha') return { ok: false, motivo: 'http' };
      if (o.anuncio === 'erro') throw new Error('bug na foto do anúncio');
      if (o.anuncio === 'lenta') {
        await new Promise((r) => setTimeout(r, 15));
        return { ok: false, motivo: 'rede' };
      }
      if (o.anuncio === 'demora') {
        await new Promise((r) => prazo.addEventListener('abort', r, { once: true }));
        return { ok: false, motivo: 'prazo' };
      }
      return { ok: true, imagem: await fotoDoAnuncioReduzida() };
    },
    async foto(e, opcoes) {
      chamadas.push({ id: e.id, opcoes });
      o.aoPedirFoto?.(chamadas.length);
      if (o.fotoFalha?.includes(e.id)) return { ok: false, motivo: 'Arquivo não encontrado no armazenamento.' };
      return { ok: true, imagem: await imagem(opcoes), sha256Calculado: e.sha256Final ? null : 'c'.repeat(64) };
    },
    async quadroDoVideo(_e, opcoes) {
      chamadas.push({ id: 'quadro', opcoes });
      if (o.semQuadro) return { imagem: null, duracaoSegundos: null, sha256Calculado: null, problema: 'Não foi possível tirar um quadro do vídeo.' };
      return { imagem: await imagem(opcoes), duracaoSegundos: 42.4, sha256Calculado: null, problema: null };
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
    dados.evidencias.push({ ...dados.evidencias[4], id: `avx${i}`, sha256Original: i.toString(16).padStart(64, '0'), sha256Final: null });
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
      'Histórico',
      'Integridade dos arquivos',
    ]);
    const paginasDasSecoes = r.secoes.map((s) => s.pagina);
    expect(paginasDasSecoes[0]).toBe(1);
    for (let i = 1; i < paginasDasSecoes.length; i++) expect(paginasDasSecoes[i]).toBeGreaterThan(paginasDasSecoes[i - 1]);
    const paginas = await paginasDoPdf(r.bytes);
    for (const s of r.secoes) expect(paginas[s.pagina - 1]).toContain(s.titulo);
    // Rodapé em todas as páginas: código, quem gerou e a numeração.
    paginas.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${r.paginas}`);
      expect(p).toContain('DEV-000123 · Dossiê de provas · gerado em 19/11/2026 15:30 por Gestora Teste');
    });
    // Índice na capa.
    expect(paginas[0]).toContain('Conteúdo');
    expect(paginas[0]).toContain(`página ${r.secoes[1].pagina}`);
  });

  it('escreve os acentos do pt-BR (WinAnsi), sem trocar letras por "?"', async () => {
    const texto = await textoDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    for (const trecho of ['Dossiê de provas', 'Código de rastreamento', 'Conferência concluída', 'Não veio no pacote (ausente)', 'Vídeo de Prova', 'Fone Bluetooth Ação']) {
      expect(texto).toContain(trecho);
    }
    expect(texto).not.toMatch(/\p{L}\?\p{L}/u);
  });

  it('capa: canal, venda e reclamação do ML, rastreio, motivos, chegada e conferência', async () => {
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
      'Recebedor Teste',
      'Início da conferência',
      '19/11/2026 10:01',
      'Fim da conferência',
      '19/11/2026 10:20',
      'Conferente Teste',
    ]) {
      expect(capa).toContain(trecho);
    }
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

  it('pacote e unidades levam o carimbo de cada foto (data e hora da captura)', async () => {
    const paginas = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    expect(paginas[1]).toContain('Foto 1');
    expect(paginas[1]).toContain('Etiqueta de rastreio e declaração de conteúdo');
    expect(paginas[1]).toContain('Foto 2');
    expect(paginas[1]).toContain('19/11/2026 10:02 · DEV-000123 · Operador Teste');
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
  });

  it('histórico: os rótulos da tela, quem e quando; sem as gerações do próprio dossiê', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const historico = paginas[r.secoes.find((s) => s.titulo === 'Histórico')!.pagina - 1];
    for (const trecho of [
      'Devolução cadastrada',
      'Chegada registrada',
      'De Pendente de chegada para Aguardando conferência',
      'Evidência processada · Foto 3 · Unidade 1',
      'Conferência concluída',
      '19/11/2026 10:20 · Conferente Teste',
      '18/11/2026 09:00 · Sistema',
      'Motivo: Teste de motivo',
    ]) {
      expect(historico).toContain(trecho);
    }
    expect(historico).not.toContain('Dossiê de provas (PDF) gerado');
  });

  it('histórico: o motivo só das ações que servem de prova (nada do texto fiscal interno)', async () => {
    const dados = dadosTeste();
    const em = new Date('2026-11-19T14:10:00Z');
    dados.eventos.push(
      { acao: 'nf_rejeitada', de: null, para: null, em, usuarioNome: null, dados: { motivo: '539 - Duplicidade; destinatário Fulano de Tal' } },
      { acao: 'devolucao_reaberta', de: 'AGUARDANDO_NF', para: 'AGUARDANDO_NF', em, usuarioNome: 'Fiscal Teste', dados: { motivo: 'Justificativa fiscal interna' } },
      { acao: 'concluida', de: 'AGUARDANDO_NF', para: 'CONCLUIDA', em, usuarioNome: null, dados: { motivo: 'Todas as unidades estavam ausentes.' } },
      { acao: 'contestacao_enviada', de: null, para: null, em, usuarioNome: 'Gestora Teste', dados: { motivo: 'SRF2' } },
    );
    const r = await gerarPdfDossie(dados, midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const historico = paginas.slice(r.secoes.find((s) => s.titulo === 'Histórico')!.pagina - 1, r.secoes.find((s) => s.titulo === 'Integridade dos arquivos')!.pagina - 1).join('\n');
    expect(historico).toContain('NF-e rejeitada');
    expect(historico).toContain('Devolução reaberta (NF cancelada)');
    expect(historico).not.toContain('Duplicidade');
    expect(historico).not.toContain('Fulano de Tal');
    expect(historico).not.toContain('Justificativa fiscal interna');
    expect(historico).toContain('Motivo: Teste de motivo');
    expect(historico).toContain('Motivo: Todas as unidades estavam ausentes.');
    expect(historico).toContain('Motivo: SRF2');
  });

  it('histórico: a chegada do pacote que voltou do armazém do ML leva o aviso, como na tela (extra, E25)', async () => {
    const dados = dadosTeste();
    dados.eventos.push({
      acao: 'recebida',
      de: 'NO_CD_MARKETPLACE',
      para: 'AGUARDANDO_CONFERENCIA',
      em: new Date('2026-11-19T14:10:00Z'),
      usuarioNome: 'Conferente Teste',
      dados: { codigoLido: '000018992531744', achadaPor: 'PEDIDO_ML', voltouDoArmazemML: true },
    });
    const r = await gerarPdfDossie(dados, midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const historico = paginas.slice(r.secoes.find((s) => s.titulo === 'Histórico')!.pagina - 1, r.secoes.find((s) => s.titulo === 'Integridade dos arquivos')!.pagina - 1).join('\n');
    expect(historico).toContain('Chegada registrada (voltou do armazém do ML)');
    expect(historico).toContain('De No CD do marketplace para Aguardando conferência');
  });

  it('integridade: quando e por quem foi gerado, e o SHA-256 e o carimbo de cada foto e do vídeo', async () => {
    const dados = dadosTeste();
    dados.evidencias[1] = { ...dados.evidencias[1], sha256Final: null }; // Foto 2 sem o hash final: calcula agora
    const r = await gerarPdfDossie(dados, midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const integridade = paginas.slice(r.secoes.find((s) => s.titulo === 'Integridade dos arquivos')!.pagina - 1).join('\n');
    expect(integridade).toContain('Gerado em 19/11/2026 15:30 por Gestora Teste');
    for (const e of dados.evidencias) {
      expect(integridade).toContain(e.sha256Original);
      if (e.sha256Final) expect(integridade).toContain(e.sha256Final);
    }
    expect(integridade).toContain(`${'c'.repeat(64)} (calculado agora)`);
    expect(integridade).toContain('19/11/2026 10:02 · DEV-000123 · Operador Teste');
    expect(integridade).toContain('Foto da avaria 2 · Unidade 1');
    expect(integridade).toContain('Vídeo de Prova');
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

  it('teto de fotos por PDF: as de cima viram aviso (sem ler o arquivo) e os hashes de todas ficam na integridade', async () => {
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
    for (const e of dados.evidencias) expect(texto).toContain(e.sha256Original);
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

  it('fotos extras do pacote (sem unidade) entram na seção Pacote e na integridade', async () => {
    const dados = dadosTeste();
    dados.evidencias.push({ ...dados.evidencias[0], id: 'extra-pacote', tipo: 'EXTRA', itemId: null, sha256Original: 'e'.repeat(64) });
    const r = await gerarPdfDossie(dados, midiasTeste());
    expect(await imagensDoPdf(r.bytes)).toHaveLength(10);
    const paginas = await paginasDoPdf(r.bytes);
    const i = r.secoes.findIndex((s) => s.titulo === 'Pacote');
    const pacote = paginas.slice(r.secoes[i].pagina - 1, r.secoes[i + 1].pagina - 1).join('\n');
    expect(pacote).toContain('Fotos extras do pacote');
    expect(pacote).toContain('Foto extra 1');
    const integridade = paginas.slice(r.secoes.find((s) => s.titulo === 'Integridade dos arquivos')!.pagina - 1).join('\n');
    expect(integridade).toContain('Foto extra 1 · Pacote');
    // Na integridade, logo depois das Fotos 1 e 2 (a ordem do corpo).
    expect(integridade.indexOf('Foto extra 1 · Pacote')).toBeLessThan(integridade.indexOf('Foto 3 · Unidade 1'));
  });

  it('caractere fora do WinAnsi (emoji) vira "?" em vez de erro', async () => {
    const dados = dadosTeste();
    dados.unidades[0] = { ...dados.unidades[0], observacao: 'Caixa amassada 📦' };
    await expect(gerarPdfDossie(dados, midiasTeste())).resolves.toMatchObject({ tentativas: 1 });
  });
});

describe('foto do anúncio no ML no dossiê (extra)', () => {
  const FOTO_A = 'https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg';
  const FOTO_B = 'https://http2.mlstatic.com/D_622222-MLB70000000002_072026-O.jpg';
  const LEGENDA = 'Foto do anúncio no ML (o que foi vendido)';
  const INDISPONIVEL = 'Foto do anúncio indisponível';
  const COMPARAR = 'Compare com as fotos da unidade';
  const REFERENCIA = 'Referência do anúncio (não é prova)';
  const SO_REFERENCIA = 'A foto do anúncio no ML, nas unidades, é só referência: não tem carimbo nem SHA-256.';
  /** O texto de cada caixa quebra em linhas: compara sem as quebras. */
  const corrido = (t: string) => t.replace(/\s+/g, ' ');
  const hashes = (t: string) => t.match(/\b[0-9a-f]{64}\b/g) ?? [];

  /** Unidades 1 e 2 com o mesmo produto (FOTO_A), a 3 com outro (FOTO_B). */
  function comFotos(m: Partial<DadosDossie> = {}, fotos: (string | null)[] = [FOTO_A, FOTO_A, FOTO_B]) {
    const dados = dadosTeste(m);
    dados.unidades = dados.unidades.map((u, i) => ({ ...u, fotoUrl: fotos[i] ?? null }));
    return dados;
  }

  async function secoes(r: Awaited<ReturnType<typeof gerarPdfDossie>>) {
    const paginas = await paginasDoPdf(r.bytes);
    return (titulo: string) => {
      const i = r.secoes.findIndex((s) => s.titulo === titulo);
      const fim = i + 1 < r.secoes.length ? r.secoes[i + 1].pagina - 1 : paginas.length;
      return paginas.slice(r.secoes[i].pagina - 1, fim).join('\n');
    };
  }

  it('ao lado do produto esperado: a foto, a legenda e a nota de que é referência do anúncio, não da conferência', async () => {
    const midias = midiasTeste({ anuncio: 'ok' });
    const r = await gerarPdfDossie(comFotos(), midias);
    const secao = await secoes(r);
    for (const titulo of ['Unidade 1 de 3', 'Unidade 2 de 3', 'Unidade 3 de 3']) {
      const u = corrido(secao(titulo));
      expect(u).toContain(LEGENDA);
      expect(u).toMatch(/Referência do anúncio no Mercado Livre, não da conferência/);
      expect(u).not.toContain(INDISPONIVEL);
      // Logo depois do produto esperado, antes do EAN.
      expect(u.indexOf('Produto esperado')).toBeLessThan(u.indexOf(LEGENDA));
      expect(u.indexOf(LEGENDA)).toBeLessThan(u.indexOf('EAN esperado'));
    }
    // A caixa com a foto: 8 fotos + o quadro + as 2 fotos de anúncio (uma vez cada no arquivo), a 400 px.
    const imagens = await imagensDoPdf(r.bytes);
    expect(imagens).toHaveLength(11);
    expect(imagens.filter((i) => Math.max(i.largura, i.altura) === IMAGEM_ANUNCIO.ladoMaior)).toHaveLength(2);
    // Nada da URL no PDF.
    expect(await textoDoPdf(r.bytes)).not.toContain('mlstatic');
    // O convite a comparar só onde há o que comparar: a foto entrou e a unidade veio (a 3 é ausente).
    expect(corrido(secao('Unidade 1 de 3'))).toContain(COMPARAR);
    expect(corrido(secao('Unidade 2 de 3'))).toContain(COMPARAR);
    expect(corrido(secao('Unidade 3 de 3'))).not.toContain(COMPARAR);
  });

  it('sem a foto do anúncio no PDF: nada de "Compare com as fotos da unidade" ao lado de "indisponível"', async () => {
    const r = await gerarPdfDossie(comFotos({}, [FOTO_A, null, FOTO_B]), midiasTeste({ anuncio: 'falha' }));
    expect(corrido(await textoDoPdf(r.bytes))).not.toContain(COMPARAR);
    const semFoto = await gerarPdfDossie(dadosTeste(), midiasTeste({ anuncio: 'ok' }));
    expect(corrido(await textoDoPdf(semFoto.bytes))).not.toContain(COMPARAR);
  });

  it('uma vez por URL (unidades com o mesmo produto), uma por vez e com o prazo de 5 s', async () => {
    const midias = midiasTeste({ anuncio: 'ok' });
    await gerarPdfDossie(comFotos(), midias);
    expect(midias.anuncios).toEqual([
      { url: FOTO_A, prazoMs: PRAZO_FOTO_ANUNCIO_MS },
      { url: FOTO_B, prazoMs: PRAZO_FOTO_ANUNCIO_MS },
    ]);
  });

  it('uma vez por URL também quando o PDF é refeito com imagens menores', async () => {
    const midias = midiasTeste({ anuncio: 'ok', pesadas: true });
    const r = await gerarPdfDossie(comFotos(), midias, { limiteBytes: 2 * 1024 * 1024 });
    expect(r.tentativas).toBe(2);
    expect(midias.anuncios.map((a) => a.url)).toEqual([FOTO_A, FOTO_B]);
    expect((await imagensDoPdf(r.bytes)).filter((i) => Math.max(i.largura, i.altura) === IMAGEM_ANUNCIO.ladoMaior)).toHaveLength(2);
  });

  it('falhou ou o produto não tem foto: "Foto do anúncio indisponível" e o PDF sai igual', async () => {
    const falha = midiasTeste({ anuncio: 'falha' });
    const r = await gerarPdfDossie(comFotos({}, [FOTO_A, null, FOTO_B]), falha);
    expect(falha.anuncios.map((a) => a.url)).toEqual([FOTO_A, FOTO_B]);
    const secao = await secoes(r);
    for (const titulo of ['Unidade 1 de 3', 'Unidade 2 de 3', 'Unidade 3 de 3']) {
      const u = corrido(secao(titulo));
      expect(u).toContain(LEGENDA);
      expect(u).toContain(INDISPONIVEL);
    }
    expect(await imagensDoPdf(r.bytes)).toHaveLength(9);
    // Sem foto nenhuma no cadastro: nada é pedido.
    const semFoto = midiasTeste({ anuncio: 'ok' });
    expect(corrido(await textoDoPdf((await gerarPdfDossie(dadosTeste(), semFoto)).bytes))).toContain(INDISPONIVEL);
    expect(semFoto.anuncios).toEqual([]);
  });

  it('integridade: a foto do anúncio aparece como referência, não guardada no sistema, sem SHA-256', async () => {
    const sem = await secoes(await gerarPdfDossie(dadosTeste(), midiasTeste()));
    const com = await secoes(await gerarPdfDossie(comFotos(), midiasTeste({ anuncio: 'ok' })));
    const integridade = corrido(com('Integridade dos arquivos'));
    expect(integridade).toContain('Foto do anúncio no ML · Unidades 1 e 2');
    expect(integridade).toContain('Foto do anúncio no ML · Unidade 3');
    expect(integridade).toMatch(/referência do anúncio, não guardada no sistema/i);
    // Nenhum hash a mais: os mesmos SHA-256 das evidências, nada para a foto do anúncio.
    expect(hashes(integridade)).toEqual(hashes(corrido(sem('Integridade dos arquivos'))));
    // Só a que entrou no PDF: indisponível não vai à integridade.
    const falhou = await secoes(await gerarPdfDossie(comFotos(), midiasTeste({ anuncio: 'falha' })));
    expect(corrido(falhou('Integridade dos arquivos'))).not.toContain('Foto do anúncio');
    expect(corrido(falhou('Integridade dos arquivos'))).not.toContain(REFERENCIA);
  });

  it('integridade: a abertura fala das fotos da conferência; com a foto do anúncio, diz que ela não tem carimbo nem SHA-256', async () => {
    const sem = corrido((await secoes(await gerarPdfDossie(dadosTeste(), midiasTeste())))('Integridade dos arquivos'));
    const com = corrido((await secoes(await gerarPdfDossie(comFotos(), midiasTeste({ anuncio: 'ok' }))))('Integridade dos arquivos'));
    for (const t of [sem, com]) {
      expect(t).toContain('As fotos da conferência neste PDF');
      expect(t).toContain('Cada foto da conferência tem gravado o carimbo');
      // A frase antiga dizia que toda imagem do PDF era cópia de arquivo guardado, com carimbo.
      expect(t).not.toContain('As imagens deste PDF');
      expect(t).not.toContain('Cada foto tem gravado');
    }
    expect(sem).not.toContain(SO_REFERENCIA);
    expect(sem).not.toContain(REFERENCIA);
    expect(com).toContain(SO_REFERENCIA);
    // Um subtítulo separa a foto do anúncio dos arquivos com hash, antes das linhas dela.
    expect(com.indexOf(REFERENCIA)).toBeGreaterThan(com.lastIndexOf('SHA-256 do original recebido'));
    expect(com.indexOf(REFERENCIA)).toBeLessThan(com.indexOf('Foto do anúncio no ML · Unidades 1 e 2'));
  });

  it('teto de fotos: a do anúncio conta no teto, mas nunca tira o lugar de uma prova', async () => {
    // 8 fotos de prova no corpo; teto 8: nenhuma foto de anúncio é pedida.
    const cheio = midiasTeste({ anuncio: 'ok' });
    const r = await gerarPdfDossie(comFotos(), cheio, { maxFotos: 8 });
    expect(cheio.anuncios).toEqual([]);
    expect(cheio.chamadas.filter((c) => c.id !== 'quadro')).toHaveLength(8);
    expect(corrido(await textoDoPdf(r.bytes))).toContain(INDISPONIVEL);
    expect((await paginasDoPdf(r.bytes))[0]).not.toContain('não entr');
    // Teto 9: sobra lugar para uma (a 1ª URL, na ordem das unidades).
    const umaVaga = midiasTeste({ anuncio: 'ok' });
    await gerarPdfDossie(comFotos(), umaVaga, { maxFotos: 9 });
    expect(umaVaga.anuncios.map((a) => a.url)).toEqual([FOTO_A]);
  });

  it('tempo das fotos do anúncio: um CDN parado não come o prazo do dossiê (as que faltam nem são pedidas)', async () => {
    const midias = midiasTeste({ anuncio: 'demora' });
    const r = await gerarPdfDossie(comFotos(), midias, { orcamentoAnunciosMs: 300 });
    expect(midias.anuncios).toHaveLength(1);
    expect(midias.anuncios[0].prazoMs).toBeLessThanOrEqual(300);
    expect(midias.anuncios.every((a) => Number.isInteger(a.prazoMs))).toBe(true);
    expect(corrido(await textoDoPdf(r.bytes)).match(new RegExp(INDISPONIVEL, 'g'))).toHaveLength(3);
  });

  it('tempo das fotos do anúncio: o que sobra do tempo (com fração de ms) vai como prazo inteiro', async () => {
    // 1ª foto: 4000 ms; ela leva uns 15 ms; a 2ª recebe o resto (uns 3984,7 ms), que o AbortSignal.timeout recusaria.
    const midias = midiasTeste({ anuncio: 'lenta' });
    const r = await gerarPdfDossie(comFotos(), midias, { orcamentoAnunciosMs: 4000 });
    expect(midias.anuncios.map((a) => a.url)).toEqual([FOTO_A, FOTO_B]);
    expect(midias.anuncios[0].prazoMs).toBe(4000);
    expect(midias.anuncios[1].prazoMs).toBeLessThan(4000);
    expect(midias.anuncios.every((a) => Number.isInteger(a.prazoMs))).toBe(true);
    expect(corrido(await textoDoPdf(r.bytes)).match(new RegExp(INDISPONIVEL, 'g'))).toHaveLength(3);
  });

  it('qualquer erro inesperado ao buscar a foto do anúncio (não o cancelamento): "indisponível" e o PDF sai', async () => {
    const avisos: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((m: unknown) => void avisos.push(String(m)));
    const midias = midiasTeste({ anuncio: 'erro' });
    const r = await gerarPdfDossie(comFotos(), midias);
    expect(midias.anuncios.map((a) => a.url)).toEqual([FOTO_A, FOTO_B]);
    // O log diz que houve erro e de que tipo, sem a URL.
    expect(avisos.map((a) => JSON.parse(a) as Record<string, unknown>)).toEqual([
      expect.objectContaining({ evento: 'dossie_foto_anuncio_erro', erro: 'Error' }),
      expect.objectContaining({ evento: 'dossie_foto_anuncio_erro', erro: 'Error' }),
    ]);
    for (const a of avisos) expect(a).not.toContain('mlstatic');
    const secao = await secoes(r);
    for (const titulo of ['Unidade 1 de 3', 'Unidade 2 de 3', 'Unidade 3 de 3']) expect(corrido(secao(titulo))).toContain(INDISPONIVEL);
    expect(await imagensDoPdf(r.bytes)).toHaveLength(9);
  });

  it('com o download de verdade (baixarFotoAnuncio) e o CDN falhando aos poucos: o PDF sai, com "indisponível" nas 3 unidades', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = vi.fn<typeof fetch>(async () => {
      await new Promise((r) => setTimeout(r, 15));
      throw new TypeError('fetch failed');
    });
    const prazos: number[] = [];
    const midias: MidiasDossie = {
      ...midiasTeste(),
      fotoDoAnuncio(url, { prazoMs, sinal }) {
        prazos.push(prazoMs);
        return baixarFotoAnuncio(url, { fetchFn, prazoMs, sinal });
      },
    };
    const r = await gerarPdfDossie(comFotos(), midias, { orcamentoAnunciosMs: 4000 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(prazos).toHaveLength(2);
    const secao = await secoes(r);
    for (const titulo of ['Unidade 1 de 3', 'Unidade 2 de 3', 'Unidade 3 de 3']) expect(corrido(secao(titulo))).toContain(INDISPONIVEL);
  });

  it('fora do ML: sem a foto do anúncio (nada é pedido)', async () => {
    const midias = midiasTeste({ anuncio: 'ok' });
    const r = await gerarPdfDossie(comFotos({ canal: 'SHOPEE', reclamacaoId: null, devolucaoExternaId: null, contaML: null, motivoReclamacaoML: null }), midias);
    expect(midias.anuncios).toEqual([]);
    expect(await textoDoPdf(r.bytes)).not.toContain('Foto do anúncio');
  });

  it('dossiê cancelado enquanto baixa a foto do anúncio: o erro sobe e nada mais é pedido', async () => {
    const controle = new AbortController();
    const midias = midiasTeste({ anuncio: 'ok', aoPedirAnuncio: () => controle.abort(new Error('foi embora')) });
    await expect(gerarPdfDossie(comFotos(), midias, { sinal: controle.signal })).rejects.toThrow('foi embora');
    expect(midias.anuncios).toHaveLength(1);
  });
});
